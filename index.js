/**
 * Toram AI Discord Bot - Enhanced Context System
 * Fitur baru: /context untuk mengajari AI definisi istilah
 */

import { verifyKey } from "discord-interactions";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

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
      env.DISCORD_PUBLIC_KEY
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
    case "context":
      return handleContext(interaction, env);
    case "contexts":
      return handleContextsList(interaction, env);
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
// COMMAND: /context (NEW!)
// ============================================

async function handleContext(interaction, env) {
  const istilah = getOptionValue(interaction.data.options, "istilah");
  const definisi = getOptionValue(interaction.data.options, "definisi");
  const kategori =
    getOptionValue(interaction.data.options, "kategori") || "umum";

  if (!istilah || !definisi) {
    return jsonResponse({
      type: 4,
      data: { content: "❌ Istilah dan definisi harus diisi!" },
    });
  }

  try {
    const knowledge = await getKnowledge(env);

    // Initialize contexts array if not exists
    if (!knowledge.contexts) {
      knowledge.contexts = [];
    }

    // Check if term already exists
    const existingIndex = knowledge.contexts.findIndex(
      (ctx) => ctx.term.toLowerCase() === istilah.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Update existing
      const old = knowledge.contexts[existingIndex];
      knowledge.contexts[existingIndex] = {
        term: istilah,
        definition: definisi,
        category: kategori,
        taught_by: interaction.member.user.username,
        updated_at: new Date().toISOString(),
        previous_definition: old.definition,
      };

      await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));

      return jsonResponse({
        type: 4,
        data: {
          embeds: [
            {
              title: "🔄 Context Diperbarui!",
              fields: [
                { name: "📖 Istilah", value: istilah, inline: true },
                { name: "🏷️ Kategori", value: kategori, inline: true },
                {
                  name: "📝 Definisi Lama",
                  value: old.definition.substring(0, 500),
                  inline: false,
                },
                {
                  name: "✨ Definisi Baru",
                  value: definisi.substring(0, 500),
                  inline: false,
                },
              ],
              color: 0xfee75c,
              footer: {
                text: `Diperbarui oleh ${interaction.member.user.username}`,
              },
            },
          ],
        },
      });
    }

    // Add new context
    knowledge.contexts.push({
      term: istilah,
      definition: definisi,
      category: kategori,
      taught_by: interaction.member.user.username,
      created_at: new Date().toISOString(),
    });

    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: "✅ Context Berhasil Dipelajari!",
            description: "AI sekarang akan memahami istilah ini dengan benar",
            fields: [
              { name: "📖 Istilah", value: istilah, inline: true },
              { name: "🏷️ Kategori", value: kategori, inline: true },
              {
                name: "💡 Definisi",
                value: definisi.substring(0, 1000),
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
    console.error("❌ Error in context:", error);
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

// ============================================
// COMMAND: /contexts (NEW!)
// ============================================

async function handleContextsList(interaction, env) {
  const kategori = getOptionValue(interaction.data.options, "kategori");

  try {
    const knowledge = await getKnowledge(env);
    const contexts = knowledge.contexts || [];

    if (contexts.length === 0) {
      return jsonResponse({
        type: 4,
        data: { content: "📭 Belum ada context. Ajari AI pakai `/context`" },
      });
    }

    // Filter by category if specified
    let filtered = contexts;
    if (kategori) {
      filtered = contexts.filter((ctx) => ctx.category === kategori);
      if (filtered.length === 0) {
        return jsonResponse({
          type: 4,
          data: {
            content: `📭 Tidak ada context dalam kategori: **${kategori}**`,
          },
        });
      }
    }

    // Group by category
    const grouped = {};
    filtered.forEach((ctx) => {
      if (!grouped[ctx.category]) {
        grouped[ctx.category] = [];
      }
      grouped[ctx.category].push(ctx);
    });

    const fields = [];
    Object.entries(grouped).forEach(([cat, items]) => {
      const list = items
        .map(
          (ctx) =>
            `• **${ctx.term}**: ${ctx.definition.substring(0, 80)}${
              ctx.definition.length > 80 ? "..." : ""
            }`
        )
        .join("\n");

      fields.push({
        name: `🏷️ ${cat.toUpperCase()} (${items.length})`,
        value: list,
        inline: false,
      });
    });

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: kategori ? `📚 Context: ${kategori}` : "📚 Semua Context AI",
            description: `Total: ${filtered.length} istilah yang AI pahami`,
            fields: fields.slice(0, 10), // Discord limit
            color: 0x5865f2,
            footer: {
              text:
                filtered.length > 50
                  ? `Menampilkan ${Math.min(50, filtered.length)} dari ${
                      filtered.length
                    } context`
                  : "Gunakan /context untuk menambah istilah baru",
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error("❌ Error in contexts:", error);
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

// ============================================
// COMMAND: /tanya (ENHANCED!)
// ============================================

async function handleTanya(interaction, env, ctx) {
  const question = getOptionValue(interaction.data.options, "pertanyaan");

  if (!question || question.length < 3) {
    return jsonResponse({
      type: 4,
      data: { content: "❓ Pertanyaan terlalu pendek!" },
    });
  }

  ctx.waitUntil(followUpResponse(interaction, env, question));

  return jsonResponse({
    type: 5, // DEFERRED
  });
}

async function followUpResponse(interaction, env, question) {
  const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}`;

  try {
    // Search knowledge base
    const knowledge = await getKnowledge(env);
    const results = searchKnowledge(knowledge, question);

    // Get relevant contexts
    const relevantContexts = getRelevantContexts(knowledge, question);

    // Get AI response WITH contexts
    const aiResponse = await getAIResponse(
      question,
      results,
      relevantContexts,
      env
    );

    // Send follow-up message
    await fetch(followUpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "🤖 Toram AI Helper",
            description: aiResponse.substring(0, 4000),
            color: 0x5865f2,
            fields:
              relevantContexts.length > 0
                ? [
                    {
                      name: "📚 Context Digunakan",
                      value: relevantContexts
                        .map((c) => `• ${c.term}`)
                        .join("\n")
                        .substring(0, 200),
                      inline: false,
                    },
                  ]
                : [],
            footer: {
              text: `Ditanya oleh ${interaction.member.user.username} | ${results.length} data + ${relevantContexts.length} context`,
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
      interaction.member.user.username
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
    } catch (webhookError) {
      console.error("❌ Failed to send error message:", webhookError);
    }
  }
}

// ============================================
// AI INTEGRATION (ENHANCED!)
// ============================================

async function getAIResponse(question, data, contexts, env) {
  if (!env.GROQ_API_KEY) {
    if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    }
    return "⚠️ GROQ_API_KEY belum diset!";
  }

  // Build context string
  const contextStr =
    contexts.length > 0
      ? `\n\nDEFINISI ISTILAH (PENTING!):\n${contexts
          .map((c) => `- ${c.term}: ${c.definition}`)
          .join("\n")}`
      : "";

  // Build Q&A context
  const qaContext = data
    .slice(0, 8)
    .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
    .join("\n\n");

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `Kamu AI helper Toram Online. Jawab singkat dan jelas maksimal 300 kata. Gunakan bahasa Indonesia.

PENTING: Gunakan definisi istilah yang diberikan dengan TEPAT. Jangan menggunakan definisi umum jika ada definisi khusus yang diberikan.${contextStr}`,
          },
          {
            role: "user",
            content: qaContext
              ? `DATABASE:\n${qaContext}\n\nPERTANYAAN: ${question}\n\nJawab berdasarkan database dan definisi istilah di atas.`
              : `PERTANYAAN: ${question}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Groq API Error:", errorText);
      if (data.length > 0) {
        return `🤖 **Dari database:**\n\n${data[0].answer}`;
      }
      return `❌ API Error: ${response.status}`;
    }

    const result = await response.json();
    return result.choices[0].message.content;
  } catch (error) {
    console.error("❌ AI Response Error:", error);
    if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    }
    return `❌ Error: ${error.message}`;
  }
}

// ============================================
// CONTEXT HELPERS (NEW!)
// ============================================

function getRelevantContexts(knowledge, query) {
  if (!knowledge.contexts || knowledge.contexts.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase();
  const scored = knowledge.contexts.map((ctx) => {
    let score = 0;
    const termLower = ctx.term.toLowerCase();

    // Exact match
    if (queryLower.includes(termLower)) {
      score += 10;
    }

    // Partial match
    const termWords = termLower.split(" ");
    termWords.forEach((word) => {
      if (word.length > 2 && queryLower.includes(word)) {
        score += 3;
      }
    });

    return { ctx, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.ctx);
}

// ============================================
// OTHER COMMANDS (sama seperti sebelumnya)
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
    console.error("❌ Error in teach:", error);
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

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

    const fields = displayResults.map((item) => {
      const editIcon = item.qa.edited_by ? " ✏️" : "";
      return {
        name: `#${item.index} - ${item.qa.question.substring(
          0,
          80
        )}${editIcon}`,
        value: `${item.qa.answer.substring(0, 150)}${
          item.qa.answer.length > 150 ? "..." : ""
        }\n📊 Relevance: ${item.score}`,
        inline: false,
      };
    });

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
                  ? `Menampilkan 10 dari ${results.length} hasil`
                  : `Gunakan nomor (#) untuk /edit atau /delete`,
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error("❌ Error in cari:", error);
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

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
    "pertanyaan_baru"
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
          content: `❌ Nomor ${index} tidak valid!`,
        },
      });
    }

    const oldQA = { ...knowledge.qa_pairs[index - 1] };

    if (pertanyaanBaru) {
      knowledge.qa_pairs[index - 1].question = pertanyaanBaru;
    }
    if (jawabanBaru) {
      knowledge.qa_pairs[index - 1].answer = jawabanBaru;
    }

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
        }
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
        }
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
    console.error("❌ Error in edit:", error);
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

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
    const end = start + perPage;
    const qaList = knowledge.qa_pairs.slice(start, end);

    const fields = qaList.map((qa, idx) => {
      const editIcon = qa.edited_by ? " ✏️" : "";
      return {
        name: `${start + idx + 1}. ${qa.question.substring(0, 60)}${editIcon}`,
        value:
          qa.answer.substring(0, 100) + (qa.answer.length > 100 ? "..." : ""),
        inline: false,
      };
    });

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: `📋 Daftar Q&A (Halaman ${currentPage}/${maxPage})`,
            fields: fields,
            color: 0x5865f2,
            footer: { text: `Total: ${total} Q&A | ✏️ = Diedit` },
          },
        ],
      },
    });
  } catch (error) {
    console.error("❌ Error in list:", error);
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

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
        data: { content: `❌ Nomor ${index} tidak valid!` },
      });
    }

    const deleted = knowledge.qa_pairs.splice(index - 1, 1)[0];
    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));

    return jsonResponse({
      type: 4,
      data: { content: `✅ Dihapus: **${deleted.question}**` },
    });
  } catch (error) {
    console.error("❌ Error in delete:", error);
    return jsonResponse({
      type: 4,
      data: { content: `❌ Error: ${error.message}` },
    });
  }
}

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
                "`/cari kata_kunci:<text>` - Cari Q&A\n" +
                "`/list [page]` - Lihat semua data",
              inline: false,
            },
            {
              name: "🎓 Mengajari Bot",
              value:
                "`/teach pertanyaan:<text> jawaban:<text>` - Ajari Q&A\n" +
                "`/context istilah:<text> definisi:<text>` - Ajari istilah/definisi",
              inline: false,
            },
            {
              name: "📚 Context Management",
              value:
                "`/contexts [kategori]` - Lihat semua context\n" +
                "`/context` kategori: senjata, stats, skills, umum, dll",
              inline: false,
            },
            {
              name: "📊 Database (Admin)",
              value:
                "`/edit nomor:<number>` - Edit Q&A\n" +
                "`/delete nomor:<number>` - Hapus data",
              inline: false,
            },
            {
              name: "💡 Contoh Context",
              value:
                "`/context istilah:ASPD definisi:Attack Speed, kecepatan serangan karakter kategori:stats`\n" +
                "Sekarang AI akan tahu ASPD = kecepatan serangan, bukan kecepatan aksi!",
              inline: false,
            },
          ],
          color: 0x5865f2,
          footer: { text: "Powered by Groq AI & Cloudflare Workers" },
        },
      ],
    },
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getKnowledge(env) {
  try {
    const data = await env.TORAM_KV.get("knowledge");
    if (data) {
      const parsed = JSON.parse(data);
      // Ensure contexts array exists
      if (!parsed.contexts) {
        parsed.contexts = [];
      }
      return parsed;
    }
  } catch (error) {
    console.error("❌ KV Get Error:", error);
  }

  return { qa_pairs: [], conversations: [], contexts: [] };
}

function searchKnowledge(knowledge, query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(" ").filter((w) => w.length > 2);

  if (queryWords.length === 0) {
    return knowledge.qa_pairs.slice(0, 20);
  }

  const scored = knowledge.qa_pairs.map((qa) => {
    const qLower = qa.question.toLowerCase();
    const aLower = qa.answer.toLowerCase();
    let score = 0;

    if (qLower.includes(queryLower)) score += 10;
    if (aLower.includes(queryLower)) score += 5;

    queryWords.forEach((word) => {
      if (qLower.includes(word)) score += 3;
      if (aLower.includes(word)) score += 1;
    });

    return { qa, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map((item) => item.qa);
}

function searchKnowledgeWithIndex(knowledge, query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(" ").filter((w) => w.length > 2);

  const scored = knowledge.qa_pairs.map((qa, index) => {
    const qLower = qa.question.toLowerCase();
    const aLower = qa.answer.toLowerCase();
    let score = 0;

    if (qLower.includes(queryLower)) score += 10;
    if (aLower.includes(queryLower)) score += 5;

    queryWords.forEach((word) => {
      if (qLower.includes(word)) score += 3;
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

    if (knowledge.conversations.length > 100) {
      knowledge.conversations = knowledge.conversations.slice(-100);
    }

    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));
  } catch (error) {
    console.error("❌ Failed to save conversation:", error);
  }
}

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
