/**
 * Toram AI Discord Bot - Cloudflare Workers Edition
 * Powered by Google Gemini AI
 */

import { verifyKey } from "discord-interactions";

// ============================================
// CONFIGURATION
// ============================================

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ============================================
// MAIN WORKER
// ============================================

export default {
  async fetch(request, env, ctx) {
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.clone().text();

    const isValidRequest = verifyKey(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY,
    );

    if (!isValidRequest) {
      return new Response("Invalid request signature", { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === 1) {
      return jsonResponse({ type: 1 });
    }

    if (interaction.type === 2) {
      return handleCommand(interaction, env, ctx);
    }

    return new Response("Unknown interaction type", { status: 400 });
  },
};

// ============================================
// COMMAND HANDLER
// ============================================

async function handleCommand(interaction, env, ctx) {
  const { name } = interaction.data;

  switch (name) {
    case "tanya":
      return handleTanya(interaction, env, ctx);
    case "teach":
      return handleTeach(interaction, env);
    case "cari":
      return handleCari(interaction, env);
    case "edit":
      return handleEdit(interaction, env);
    case "list":
      return handleList(interaction, env);
    case "delete":
      return handleDelete(interaction, env);
    case "help":
      return handleHelp(interaction);
    default:
      return jsonResponse({
        type: 4,
        data: { content: "❌ Command tidak dikenal!" },
      });
  }
}

// ============================================
// COMMAND: /tanya
// ============================================

async function handleTanya(interaction, env, ctx) {
  const question = getOptionValue(interaction.data.options, "pertanyaan");

  if (!question || question.length < 2) {
    return jsonResponse({
      type: 4,
      data: { content: "❓ Pertanyaan terlalu pendek!" },
    });
  }

  ctx.waitUntil(followUpResponse(interaction, env, question));

  return jsonResponse({ type: 5 });
}

async function followUpResponse(interaction, env, question) {
  const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}`;

  try {
    const knowledge = await getKnowledge(env);
    const results = searchKnowledge(knowledge, question);
    const aiResponse = await getAIResponse(question, results, env);

    await fetch(followUpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🤖 Toram AI Helper",
            description: aiResponse.substring(0, 4000),
            color: 0x5865f2,
            footer: {
              text: `Ditanya oleh ${interaction.member.user.username} | ${results.length} data ditemukan`,
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    await saveConversation(
      env,
      question,
      aiResponse,
      interaction.member.user.username,
    );
  } catch (error) {
    console.error("❌ Error in followUpResponse:", error);
    try {
      await fetch(followUpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `❌ Terjadi error: ${error.message}`,
        }),
      });
    } catch (e) {
      console.error("❌ Failed to send error message:", e);
    }
  }
}

// ============================================
// COMMAND: /teach
// ============================================

async function handleTeach(interaction, env) {
  const pertanyaan = getOptionValue(interaction.data.options, "pertanyaan");
  const jawaban = getOptionValue(interaction.data.options, "jawaban");

  if (!pertanyaan || !jawaban) {
    return jsonResponse({
      type: 4,
      data: { content: "❌ Pertanyaan dan jawaban harus diisi!" },
    });
  }

  try {
    const knowledge = await getKnowledge(env);
    knowledge.qa_pairs.push({
      question: pertanyaan,
      answer: jawaban,
      taught_by: interaction.member.user.username,
      timestamp: new Date().toISOString(),
    });

    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: "✅ Berhasil Dipelajari!",
            fields: [
              { name: "❓ Pertanyaan", value: pertanyaan, inline: false },
              {
                name: "💡 Jawaban",
                value: jawaban.substring(0, 1000),
                inline: false,
              },
            ],
            color: 0x57f287,
            footer: {
              text: `Diajarkan oleh ${interaction.member.user.username}`,
            },
          },
        ],
      },
    });
  } catch (error) {
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

// ============================================
// COMMAND: /cari
// ============================================

async function handleCari(interaction, env) {
  const keyword = getOptionValue(interaction.data.options, "kata_kunci");

  if (!keyword || keyword.length < 2) {
    return jsonResponse({
      type: 4,
      data: { content: "❌ Kata kunci terlalu pendek! Minimal 2 karakter." },
    });
  }

  try {
    const knowledge = await getKnowledge(env);
    const results = searchKnowledgeWithIndex(knowledge, keyword);

    if (results.length === 0) {
      return jsonResponse({
        type: 4,
        data: {
          content: `🔍 Tidak ditemukan Q&A dengan kata kunci: **${keyword}**`,
        },
      });
    }

    const displayResults = results.slice(0, 10);
    const fields = displayResults.map((item) => ({
      name: `#${item.index} - ${item.qa.question.substring(0, 80)}${item.qa.edited_by ? " ✏️" : ""}`,
      value:
        `${item.qa.answer.substring(0, 150)}${item.qa.answer.length > 150 ? "..." : ""}\n` +
        `📊 Relevansi: ${item.score}`,
      inline: false,
    }));

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: `🔍 Hasil Pencarian: "${keyword}"`,
            description: `Ditemukan ${results.length} Q&A yang relevan`,
            fields: fields,
            color: 0x5865f2,
            footer: {
              text:
                results.length > 10
                  ? `Menampilkan 10 dari ${results.length} hasil | Gunakan nomor (#) untuk /edit atau /delete`
                  : `Gunakan nomor (#) untuk /edit atau /delete`,
            },
          },
        ],
      },
    });
  } catch (error) {
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

// ============================================
// COMMAND: /edit
// ============================================

async function handleEdit(interaction, env) {
  const permissions = BigInt(interaction.member.permissions);
  const MANAGE_MESSAGES = 1n << 13n;

  if (!(permissions & MANAGE_MESSAGES)) {
    return jsonResponse({
      type: 4,
      data: { content: "❌ Kamu tidak punya izin untuk edit Q&A!" },
    });
  }

  const index = getOptionValue(interaction.data.options, "nomor");
  const pertanyaanBaru = getOptionValue(
    interaction.data.options,
    "pertanyaan_baru",
  );
  const jawabanBaru = getOptionValue(interaction.data.options, "jawaban_baru");

  if (!pertanyaanBaru && !jawabanBaru) {
    return jsonResponse({
      type: 4,
      data: { content: "❌ Minimal isi pertanyaan_baru atau jawaban_baru!" },
    });
  }

  try {
    const knowledge = await getKnowledge(env);

    if (index < 1 || index > knowledge.qa_pairs.length) {
      return jsonResponse({
        type: 4,
        data: {
          content: `❌ Nomor ${index} tidak valid! Gunakan \`/cari\` atau \`/list\` untuk cek nomor.`,
        },
      });
    }

    const oldQA = { ...knowledge.qa_pairs[index - 1] };

    if (pertanyaanBaru) knowledge.qa_pairs[index - 1].question = pertanyaanBaru;
    if (jawabanBaru) knowledge.qa_pairs[index - 1].answer = jawabanBaru;

    knowledge.qa_pairs[index - 1].edited_by = interaction.member.user.username;
    knowledge.qa_pairs[index - 1].edited_at = new Date().toISOString();

    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));

    const fields = [];
    if (pertanyaanBaru) {
      fields.push(
        {
          name: "📝 Pertanyaan Lama",
          value: oldQA.question.substring(0, 1000),
          inline: false,
        },
        {
          name: "✨ Pertanyaan Baru",
          value: pertanyaanBaru.substring(0, 1000),
          inline: false,
        },
      );
    }
    if (jawabanBaru) {
      fields.push(
        {
          name: "📝 Jawaban Lama",
          value: oldQA.answer.substring(0, 1000),
          inline: false,
        },
        {
          name: "✨ Jawaban Baru",
          value: jawabanBaru.substring(0, 1000),
          inline: false,
        },
      );
    }

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: `✅ Q&A #${index} Berhasil Diedit!`,
            fields: fields,
            color: 0xfee75c,
            footer: { text: `Diedit oleh ${interaction.member.user.username}` },
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
  } catch (error) {
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

// ============================================
// COMMAND: /list
// ============================================

async function handleList(interaction, env) {
  const page = getOptionValue(interaction.data.options, "page") || 1;
  const perPage = 10;

  try {
    const knowledge = await getKnowledge(env);
    const total = knowledge.qa_pairs.length;

    if (total === 0) {
      return jsonResponse({
        type: 4,
        data: { content: "📭 Belum ada Q&A. Ajari aku pakai `/teach`" },
      });
    }

    const maxPage = Math.ceil(total / perPage);
    const currentPage = Math.max(1, Math.min(page, maxPage));
    const start = (currentPage - 1) * perPage;
    const qaList = knowledge.qa_pairs.slice(start, start + perPage);

    const fields = qaList.map((qa, idx) => ({
      name: `${start + idx + 1}. ${qa.question.substring(0, 60)}${qa.edited_by ? " ✏️" : ""}`,
      value:
        qa.answer.substring(0, 100) + (qa.answer.length > 100 ? "..." : ""),
      inline: false,
    }));

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: `📋 Daftar Q&A (Halaman ${currentPage}/${maxPage})`,
            fields: fields,
            color: 0x5865f2,
            footer: {
              text: `Total: ${total} Q&A | ✏️ = Diedit | Gunakan /cari untuk pencarian cepat`,
            },
          },
        ],
      },
    });
  } catch (error) {
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

// ============================================
// COMMAND: /delete
// ============================================

async function handleDelete(interaction, env) {
  const permissions = BigInt(interaction.member.permissions);
  const MANAGE_MESSAGES = 1n << 13n;

  if (!(permissions & MANAGE_MESSAGES)) {
    return jsonResponse({
      type: 4,
      data: { content: "❌ Kamu tidak punya izin untuk hapus Q&A!" },
    });
  }

  const index = getOptionValue(interaction.data.options, "nomor");

  try {
    const knowledge = await getKnowledge(env);

    if (index < 1 || index > knowledge.qa_pairs.length) {
      return jsonResponse({
        type: 4,
        data: {
          content: `❌ Nomor ${index} tidak valid! Gunakan \`/cari\` atau \`/list\` untuk cek nomor.`,
        },
      });
    }

    const deleted = knowledge.qa_pairs.splice(index - 1, 1)[0];
    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));

    return jsonResponse({
      type: 4,
      data: {
        content: `✅ Dihapus: **${deleted.question.substring(0, 100)}**`,
      },
    });
  } catch (error) {
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

// ============================================
// COMMAND: /help
// ============================================

async function handleHelp(interaction) {
  return jsonResponse({
    type: 4,
    data: {
      embeds: [
        {
          title: "🎮 Toram AI Bot",
          description: "Bot AI yang bisa belajar dari kamu!",
          fields: [
            {
              name: "💬 Bertanya",
              value:
                "`/tanya pertanyaan:<text>` - Tanya ke AI\n" +
                "`/cari kata_kunci:<text>` - Cari Q&A dengan nomor\n" +
                "`/list [page]` - Lihat semua data",
              inline: false,
            },
            {
              name: "🎓 Mengajari Bot",
              value: "`/teach pertanyaan:<text> jawaban:<text>` - Ajari bot",
              inline: false,
            },
            {
              name: "📊 Database Management (Admin)",
              value:
                "`/edit nomor:<number>` - Edit Q&A\n" +
                "`/delete nomor:<number>` - Hapus data",
              inline: false,
            },
            {
              name: "💡 Tips",
              value:
                "• Gunakan `/cari` untuk menemukan nomor Q&A\n" +
                "• Pertanyaan dengan pipe `|` berarti banyak sinonim yang bisa dipakai",
              inline: false,
            },
          ],
          color: 0x5865f2,
          footer: { text: "Powered by Google Gemini & Cloudflare Workers" },
        },
      ],
    },
  });
}

// ============================================
// AI INTEGRATION - GEMINI
// ============================================

async function getAIResponse(question, data, env) {
  if (!env.GEMINI_API_KEY) {
    if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    }
    return "⚠️ GEMINI_API_KEY belum diset! Set di Cloudflare Dashboard → Settings → Variables";
  }

  // Gabungkan semua hasil pencarian jadi context
  const context = data
    .slice(0, 8)
    .map((item) => `PERTANYAAN: ${item.question}\nJAWABAN: ${item.answer}`)
    .join("\n\n---\n\n");

  const systemPrompt = `Kamu adalah AI helper untuk game Toram Online.

ATURAN:
1. Jawab HANYA berdasarkan data di database.
2. Jika pertanyaan tentang KODE BUFF, tampilkan SEMUA kodenya.
3. Jika jawaban dari database terlalu panjang, RINGKAS jadi poin-poin penting.
4. Jika pertanyaan mencakup range besar (contoh: "leveling 1 sampai cap"), 
   tampilkan ringkasan per range saja, jangan copy paste semua data mentah.
5. Gunakan bahasa Indonesia singkat dan jelas.
6. Jawab selengkap mungkin, maksimal 4000 karakter. Jangan potong jawaban di tengah.`;

  const userPrompt = context
    ? `DATABASE:\n${context}\n\n---\n\nPERTANYAAN PEMAIN: ${question}\n\nJawab berdasarkan database di atas. Jika kode buff, tampilkan SEMUA kodenya.`
    : `PERTANYAAN PEMAIN: ${question}\n\nData tidak ditemukan di database untuk pertanyaan ini.`;

  try {
    const response = await fetch(
      `${GEMINI_API_URL}?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1, // Rendah = lebih akurat, tidak mengarang
            maxOutputTokens: 2048,
            topP: 0.8,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Gemini API Error:", errorText);

      if (data.length > 0) {
        return `🤖 **Dari database:**\n\n${data[0].answer}`;
      }
      return `❌ API Error: ${response.status}`;
    }

    const result = await response.json();

    // Format response Gemini berbeda dari OpenAI/Groq
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      if (data.length > 0) return `🤖 **Dari database:**\n\n${data[0].answer}`;
      return "❌ Tidak ada jawaban dari AI.";
    }

    return text;
  } catch (error) {
    console.error("❌ AI Response Error:", error);
    if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    }
    return `❌ Error: ${error.message}`;
  }
}

// ============================================
// KNOWLEDGE BASE HELPERS
// ============================================

async function getKnowledge(env) {
  try {
    const data = await env.TORAM_KV.get("knowledge");
    if (data) return JSON.parse(data);
  } catch (error) {
    console.error("❌ KV Get Error:", error);
  }
  return { qa_pairs: [], conversations: [] };
}

function searchKnowledge(knowledge, query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  if (queryWords.length === 0) return knowledge.qa_pairs.slice(0, 10);

  const scored = knowledge.qa_pairs.map((qa) => {
    // Pisahkan sinonim dari pipe
    const questionVariants = qa.question
      .toLowerCase()
      .split("|")
      .map((s) => s.trim());
    const aLower = qa.answer.toLowerCase();
    let score = 0;

    // Cek exact match di salah satu varian
    for (const variant of questionVariants) {
      if (variant.includes(queryLower)) score += 15;
      if (queryLower.includes(variant)) score += 10;
    }

    if (aLower.includes(queryLower)) score += 5;

    // Word matching
    queryWords.forEach((word) => {
      for (const variant of questionVariants) {
        if (variant.includes(word)) score += 4;
      }
      if (aLower.includes(word)) score += 1;
    });

    return { qa, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.qa);
}

function searchKnowledgeWithIndex(knowledge, query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  const scored = knowledge.qa_pairs.map((qa, index) => {
    const questionVariants = qa.question
      .toLowerCase()
      .split("|")
      .map((s) => s.trim());
    const aLower = qa.answer.toLowerCase();
    let score = 0;

    for (const variant of questionVariants) {
      if (variant.includes(queryLower)) score += 15;
      if (queryLower.includes(variant)) score += 10;
    }

    if (aLower.includes(queryLower)) score += 5;

    queryWords.forEach((word) => {
      for (const variant of questionVariants) {
        if (variant.includes(word)) score += 4;
      }
      if (aLower.includes(word)) score += 1;
    });

    return { qa, score, index: index + 1 };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function saveConversation(env, question, answer, user) {
  try {
    const knowledge = await getKnowledge(env);
    knowledge.conversations = knowledge.conversations || [];
    knowledge.conversations.push({
      question: question.substring(0, 200),
      answer: answer.substring(0, 300),
      user: user,
      timestamp: new Date().toISOString(),
    });

    // Simpan hanya 50 conversation terakhir
    if (knowledge.conversations.length > 50) {
      knowledge.conversations = knowledge.conversations.slice(-50);
    }

    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));
  } catch (error) {
    console.error("❌ Failed to save conversation:", error);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getOptionValue(options, name) {
  if (!options) return null;
  const option = options.find((opt) => opt.name === name);
  return option ? option.value : null;
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
