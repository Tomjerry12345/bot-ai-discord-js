/**
 * Toram AI Discord Bot - Cloudflare Workers Edition
 * With Edit & Search Feature
 * Powered by Google Gemini API (multi-model, multi-key rotation)
 */

import { verifyKey } from "discord-interactions";

// ============================================
// CONFIGURATION - GEMINI MULTI-MODEL & MULTI-KEY
// ============================================

// Model priority list: jika model[0] limit, coba model[1], dst.
const GEMINI_MODELS = [
  "gemini-3.5-flash", // Terkuat, terbaru
  "gemini-2.5-flash", // Stable, powerful
  "gemini-2.5-flash-lite", // Hemat, cepat
  "gemini-3.1-flash", // Paling hemat, fallback terakhir
];

// Cara pakai: di Cloudflare Workers → Settings → Variables → Secrets
// Tambahkan: GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3
// Rotasi: semua model di key[0] dicoba dulu → jika semua limit → pindah ke key[1], dst.

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// ============================================
// GEMINI API CALLER WITH MODEL + KEY ROTATION
// ============================================

async function callGeminiWithRotation(prompt, env) {
  // Ambil API keys dari environment (bisa 1-3 keys)
  const apiKeys = [
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
  ].filter(Boolean); // hapus yang kosong/undefined

  if (apiKeys.length === 0) {
    throw new Error(
      "Tidak ada GEMINI_API_KEY yang dikonfigurasi! Tambahkan GEMINI_API_KEY_1 di Cloudflare Workers Settings.",
    );
  }

  // Unik model names untuk rotasi (hapus duplikat tapi pertahankan urutan)
  const uniqueModels = [...new Set(GEMINI_MODELS)];

  // Loop: tiap API key → coba semua model → jika semua limit → pindah key berikutnya
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    console.log(`🔑 Mencoba API Key ${keyIdx + 1}/${apiKeys.length}`);

    for (let modelIdx = 0; modelIdx < uniqueModels.length; modelIdx++) {
      const currentModel = uniqueModels[modelIdx];
      console.log(`🤖 Mencoba model: ${currentModel}`);

      try {
        const url = `${GEMINI_API_BASE}/${currentModel}:generateContent?key=${currentKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            console.log(
              `✅ Berhasil dengan model: ${currentModel}, Key: ${keyIdx + 1}`,
            );
            return { text, model: currentModel, keyIndex: keyIdx + 1 };
          }
        }

        // Cek apakah error karena rate limit / quota
        const errorText = await response.text();
        let errorData = {};
        try {
          errorData = JSON.parse(errorText);
        } catch {}

        const errorCode = response.status;
        const isRateLimit =
          errorCode === 429 ||
          errorText.includes("RESOURCE_EXHAUSTED") ||
          errorText.includes("quota") ||
          errorText.includes("rate limit");

        if (isRateLimit) {
          console.warn(
            `⚠️ Model ${currentModel} (Key ${keyIdx + 1}) rate limited, coba model berikutnya...`,
          );
          continue; // coba model berikutnya
        }

        // Error lain (bukan rate limit) - log tapi tetap coba model berikutnya
        console.error(
          `❌ Model ${currentModel} error ${errorCode}:`,
          errorText.substring(0, 200),
        );
        continue;
      } catch (fetchError) {
        console.error(
          `❌ Fetch error pada model ${currentModel}:`,
          fetchError.message,
        );
        continue;
      }
    }

    // Semua model di key ini limit/error → coba key berikutnya
    console.warn(
      `⚠️ Semua model habis di Key ${keyIdx + 1}, pindah ke Key ${keyIdx + 2}...`,
    );
  }

  // Semua key dan model sudah dicoba, semua gagal
  throw new Error(
    "Semua API key dan model sedang rate limit atau error. Coba lagi nanti.",
  );
}

// ============================================
// MAIN WORKER
// ============================================

export default {
  async fetch(request, env, ctx) {
    // Verify Discord signature
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

    // Handle Discord PING
    if (interaction.type === 1) {
      return jsonResponse({ type: 1 });
    }

    // Handle Slash Commands
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

  if (!question || question.length < 3) {
    return jsonResponse({
      type: 4,
      data: { content: "❓ Pertanyaan terlalu pendek!" },
    });
  }

  // Use waitUntil to process response asynchronously
  ctx.waitUntil(followUpResponse(interaction, env, question));

  // Defer reply immediately
  return jsonResponse({
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  });
}

async function followUpResponse(interaction, env, question) {
  const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}`;

  try {
    // Search knowledge base
    const knowledge = await getKnowledge(env);
    const results = searchKnowledge(knowledge, question);

    // Get AI response
    const aiResponse = await getAIResponse(question, results, env);

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
            footer: {
              text: `Ditanya oleh ${interaction.member.user.username} | ${results.length} data ditemukan`,
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    // Save conversation
    await saveConversation(
      env,
      question,
      aiResponse,
      interaction.member.user.username,
    );
  } catch (error) {
    console.error("❌ Error in followUpResponse:", error);

    // Send error message to Discord
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
    // Get existing knowledge
    const knowledge = await getKnowledge(env);

    // Add new Q&A
    knowledge.qa_pairs.push({
      question: pertanyaan,
      answer: jawaban,
      taught_by: interaction.member.user.username,
      timestamp: new Date().toISOString(),
    });

    // Save to KV
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

// ============================================
// COMMAND: /cari (NEW)
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

    // Limit to 10 results
    const displayResults = results.slice(0, 10);

    const fields = displayResults.map((item) => {
      const editIcon = item.qa.edited_by ? " ✏️" : "";
      return {
        name: `#${item.index} - ${item.qa.question.substring(
          0,
          80,
        )}${editIcon}`,
        value:
          `${item.qa.answer.substring(0, 150)}${
            item.qa.answer.length > 150 ? "..." : ""
          }\n` + `📊 Relevance: ${item.score}`,
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
                  ? `Menampilkan 10 dari ${results.length} hasil | Gunakan nomor (#) untuk /edit atau /delete`
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

// ============================================
// COMMAND: /edit
// ============================================

async function handleEdit(interaction, env) {
  // Check if user has manage_messages permission
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

    // Update question if provided
    if (pertanyaanBaru) {
      knowledge.qa_pairs[index - 1].question = pertanyaanBaru;
    }

    // Update answer if provided
    if (jawabanBaru) {
      knowledge.qa_pairs[index - 1].answer = jawabanBaru;
    }

    // Add edit metadata
    knowledge.qa_pairs[index - 1].edited_by = interaction.member.user.username;
    knowledge.qa_pairs[index - 1].edited_at = new Date().toISOString();

    await env.TORAM_KV.put("knowledge", JSON.stringify(knowledge));

    // Build response fields
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
            footer: {
              text: `Diedit oleh ${interaction.member.user.username}`,
            },
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
            footer: {
              text: `Total: ${total} Q&A | ✏️ = Diedit | Gunakan /cari untuk pencarian cepat`,
            },
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

// ============================================
// COMMAND: /delete
// ============================================

async function handleDelete(interaction, env) {
  // Check if user has manage_messages permission
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
                "• Gunakan `/cari` untuk menemukan nomor Q&A yang ingin diedit\n" +
                "• Nomor Q&A ditampilkan dengan format **#1**, **#2**, dst",
              inline: false,
            },
          ],
          color: 0x5865f2,
          footer: { text: "Powered by Google Gemini AI & Cloudflare Workers" },
        },
      ],
    },
  });
}

// ============================================
// AI INTEGRATION
// ============================================

async function getAIResponse(question, data, env) {
  // Cek apakah minimal ada 1 API key
  const hasKey =
    env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY_2 || env.GEMINI_API_KEY_3;

  if (!hasKey) {
    if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    }
    return "⚠️ GEMINI_API_KEY_1 belum diset! Tambahkan di Cloudflare Workers → Settings → Variables & Secrets";
  }

  // Build context from search results
  const context = data
    .slice(0, 10)
    .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
    .join("\n\n");

  const prompt = context
    ? `Kamu adalah AI helper Toram Online. Jawab LENGKAP dan jelas dalam bahasa Indonesia. Jangan potong jawaban di tengah.\n\nDATABASE:\n${context}\n\nPERTANYAAN: ${question}\n\nJawab berdasarkan database di atas secara lengkap.`
    : `Kamu adalah AI helper Toram Online. Jawab LENGKAP dan jelas dalam bahasa Indonesia.\n\nPERTANYAAN: ${question}`;

  try {
    const result = await callGeminiWithRotation(prompt, env);
    return result.text;
  } catch (error) {
    console.error("❌ Gemini AI Error:", error.message);

    // Fallback ke database jika semua API gagal
    if (data.length > 0) {
      return `🤖 **Dari database (AI tidak tersedia):**\n\n${data[0].answer}`;
    }
    return `❌ ${error.message}`;
  }
}

// ============================================
// KNOWLEDGE BASE HELPERS
// ============================================

async function getKnowledge(env) {
  try {
    const data = await env.TORAM_KV.get("knowledge");
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("❌ KV Get Error:", error);
  }

  // Return empty structure if no data or error
  return { qa_pairs: [], conversations: [] };
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

// Search with index numbers (for /cari command)
function searchKnowledgeWithIndex(knowledge, query) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(" ").filter((w) => w.length > 2);

  const scored = knowledge.qa_pairs.map((qa, index) => {
    const qLower = qa.question.toLowerCase();
    const aLower = qa.answer.toLowerCase();
    let score = 0;

    // Exact phrase match in question gets highest score
    if (qLower.includes(queryLower)) score += 10;
    if (aLower.includes(queryLower)) score += 5;

    // Word matching
    queryWords.forEach((word) => {
      if (qLower.includes(word)) score += 3;
      if (aLower.includes(word)) score += 1;
    });

    return {
      qa,
      score,
      index: index + 1, // Human-readable index (starts from 1)
    };
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

    // Keep only last 100 conversations
    if (knowledge.conversations.length > 100) {
      knowledge.conversations = knowledge.conversations.slice(-100);
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
