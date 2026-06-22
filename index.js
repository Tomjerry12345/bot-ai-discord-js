/**
 * Toram AI Discord Bot - Cloudflare Workers Edition
 * With Edit & Search Feature + Conversation Context Per User
 * Powered by Google Gemini API (multi-model, multi-key rotation)
 *
 * OPTIMIZED: Paralel API calls, hapus selectRelevantData(),
 * deteksi kategori xtall pakai keyword (bukan AI),
 * dari 4 API call → 2 API call, 2-3x lebih cepat.
 */

import { verifyKey } from "discord-interactions";

// ============================================
// CONFIGURATION - GEMINI MULTI-MODEL & MULTI-KEY
// ============================================

const GEMINI_MODELS = [
  "gemini-3.5-flash", // Terkuat, terbaru
  "gemini-2.5-flash", // Stable, powerful
  "gemini-2.5-flash-lite", // Hemat, cepat
  "gemini-3.1-flash", // Paling hemat, fallback terakhir
];

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// Berapa pesan history yang disimpan per user
const MAX_CONTEXT_MESSAGES = 6; // 3 pasang tanya-jawab
// Berapa lama context disimpan (detik) - default 30 menit
const CONTEXT_TTL = 60 * 30;

// ============================================
// XTALL CONFIG
// ============================================

const XTALL_CATEGORIES = ["weapon", "armor", "additional", "special", "normal"];

// Keyword yang mengindikasikan pertanyaan tentang xtall/crysta
const XTALL_KEYWORDS = [
  "xtall",
  "crysta",
  "crystal",
  "xtal",
  "rekomendasi crysta",
  "crysta apa",
  "xtall apa",
  "upgrade",
  "usedfor",
  "drop dari",
  "monster drop",
];

function isXtallQuestion(question) {
  const q = question.toLowerCase();
  return XTALL_KEYWORDS.some((kw) => q.includes(kw));
}

/**
 * OPTIMASI: Deteksi kategori xtall pakai keyword — tidak pakai AI.
 * Hemat 1 API call setiap pertanyaan xtall.
 */
function detectXtallCategories(question) {
  const q = question.toLowerCase();
  const cats = [];

  if (
    q.includes("weapon") ||
    q.includes("senjata") ||
    q.includes("bow") ||
    q.includes("sword") ||
    q.includes("staff") ||
    q.includes("knuckle") ||
    q.includes("katana") ||
    q.includes("halberd") ||
    q.includes("magic device")
  ) {
    cats.push("weapon");
  }
  if (
    q.includes("armor") ||
    q.includes("baju") ||
    q.includes("pakaian") ||
    q.includes("def") ||
    q.includes("pertahanan")
  ) {
    cats.push("armor");
  }
  if (
    q.includes("additional") ||
    q.includes("add ") ||
    q.includes("addtional")
  ) {
    cats.push("additional");
  }
  if (q.includes("special") || q.includes("spec ") || q.includes("spesial")) {
    cats.push("special");
  }
  if (q.includes("normal") || q.includes("biasa")) {
    cats.push("normal");
  }

  // Fallback: fetch semua kategori kalau tidak spesifik
  return cats.length > 0 ? cats : XTALL_CATEGORIES;
}

// ============================================
// GEMINI API CALLER WITH MODEL + KEY ROTATION
// ============================================

async function callGeminiWithRotation(prompt, env, conversationHistory = []) {
  const apiKeys = [
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
  ].filter(Boolean);

  if (apiKeys.length === 0) {
    throw new Error(
      "Tidak ada GEMINI_API_KEY yang dikonfigurasi! Tambahkan GEMINI_API_KEY_1 di Cloudflare Workers Settings.",
    );
  }

  const uniqueModels = [...new Set(GEMINI_MODELS)];

  // Build contents array dengan conversation history
  const contents = [];

  // Tambahkan history sebelumnya
  for (const msg of conversationHistory) {
    contents.push({ role: msg.role, parts: [{ text: msg.text }] });
  }

  // Tambahkan prompt baru sebagai user message
  contents.push({ role: "user", parts: [{ text: prompt }] });

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
            contents: contents,
            systemInstruction: {
              parts: [
                {
                  text: "Kamu adalah asisten game Toram Online. Jawab dalam bahasa Indonesia. Gunakan konteks percakapan sebelumnya untuk memahami pertanyaan lanjutan. Langsung berikan jawaban tanpa menulis proses berpikir, checklist, atau catatan internal.",
                },
              ],
            },
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
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

        const errorText = await response.text();
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
          continue;
        }

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

    console.warn(
      `⚠️ Semua model habis di Key ${keyIdx + 1}, pindah ke Key ${keyIdx + 2}...`,
    );
  }

  throw new Error(
    "Semua API key dan model sedang rate limit atau error. Coba lagi nanti.",
  );
}

// ============================================
// CONVERSATION CONTEXT HELPERS
// ============================================

// Key KV: "ctx:{userId}" → array of {role, text}
async function getUserContext(env, userId) {
  try {
    const data = await env.TORAM_KV.get(`ctx:${userId}`);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error("❌ Error get context:", e);
  }
  return [];
}

async function saveUserContext(env, userId, history) {
  try {
    // Simpan hanya MAX_CONTEXT_MESSAGES pesan terakhir
    const trimmed = history.slice(-MAX_CONTEXT_MESSAGES);
    await env.TORAM_KV.put(`ctx:${userId}`, JSON.stringify(trimmed), {
      expirationTtl: CONTEXT_TTL,
    });
  } catch (e) {
    console.error("❌ Error save context:", e);
  }
}

async function clearUserContext(env, userId) {
  try {
    await env.TORAM_KV.delete(`ctx:${userId}`);
  } catch (e) {
    console.error("❌ Error clear context:", e);
  }
}

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
    case "reset":
      return handleReset(interaction, env);
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

  ctx.waitUntil(followUpResponse(interaction, env, question));

  return jsonResponse({
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  });
}

async function followUpResponse(interaction, env, question) {
  const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}`;
  const userId = interaction.member.user.id;
  const username = interaction.member.user.username;

  try {
    /**
     * OPTIMASI: Jalankan semua persiapan secara PARALEL:
     * - getUserContext (KV read)
     * - searchKnowledge dari getKnowledge (KV read)
     * - fetchXtallData jika pertanyaan xtall (GitHub fetch + 1 AI call)
     *
     * Dulu: berurutan → sekarang: paralel → lebih cepat
     */
    const [userContext, knowledge] = await Promise.all([
      getUserContext(env, userId),
      getKnowledge(env),
    ]);

    const results = searchKnowledge(knowledge, question);

    // fetchXtallData paralel dengan context (sudah selesai di atas),
    // tapi pisah karena butuh `results` dulu untuk getAIResponse
    const xtallData = isXtallQuestion(question)
      ? await fetchXtallData(env, question)
      : null;

    // Get AI response dengan context + xtall data
    // OPTIMASI: selectRelevantData() dihapus, langsung pakai keyword results
    const aiResponse = await getAIResponse(
      question,
      results,
      env,
      userContext,
      xtallData,
    );

    // Update context: tambah pertanyaan user dan jawaban AI
    const updatedContext = [
      ...userContext,
      { role: "user", text: question },
      { role: "model", text: aiResponse },
    ];

    // Simpan context ke KV (tidak perlu await, fire-and-forget)
    saveUserContext(env, userId, updatedContext).catch((e) =>
      console.error("❌ saveUserContext failed:", e),
    );
    // Simpan log conversation (tidak perlu await)
    saveConversation(env, question, aiResponse, username).catch((e) =>
      console.error("❌ saveConversation failed:", e),
    );

    const turnCount = Math.floor(updatedContext.length / 2);
    const contextInfo =
      turnCount > 1 ? ` | 🧠 Konteks: ${turnCount} pesan` : "";

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
              text: `Ditanya oleh ${username} | ${results.length} data ditemukan${contextInfo} | /reset untuk mulai baru`,
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
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
// COMMAND: /reset
// ============================================

async function handleReset(interaction, env) {
  const userId = interaction.member.user.id;
  await clearUserContext(env, userId);

  return jsonResponse({
    type: 4,
    data: {
      embeds: [
        {
          title: "🔄 Konteks Dihapus",
          description:
            "Percakapan kamu direset! Saya sudah lupa obrolan sebelumnya.\n\nGunakan `/tanya` untuk mulai percakapan baru.",
          color: 0xfee75c,
          footer: { text: `Reset oleh ${interaction.member.user.username}` },
        },
      ],
      flags: 64, // Ephemeral - hanya user yang bisa lihat
    },
  });
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
    console.error("❌ Error in teach:", error);
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

    const fields = displayResults.map((item) => {
      const editIcon = item.qa.edited_by ? " ✏️" : "";
      return {
        name: `#${item.index} - ${item.qa.question.substring(0, 80)}${editIcon}`,
        value:
          `${item.qa.answer.substring(0, 150)}${item.qa.answer.length > 150 ? "..." : ""}\n` +
          `📊 Relevance: ${item.score}`,
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
                "`/tanya pertanyaan:<text>` - Tanya ke AI (ingat konteks)\n" +
                "`/cari kata_kunci:<text>` - Cari Q&A dengan nomor\n" +
                "`/list [page]` - Lihat semua data",
              inline: false,
            },
            {
              name: "🧠 Konteks Percakapan",
              value:
                "`/reset` - Hapus memori percakapan kamu\n" +
                "Bot mengingat **3 pertanyaan terakhir** kamu selama **30 menit**.\n" +
                "Jadi kamu bisa tanya lanjutan tanpa perlu jelaskan ulang!",
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
                "• Tanya lanjutan langsung tanpa jelaskan ulang konteks\n" +
                "• Gunakan `/reset` kalau mau ganti topik\n" +
                "• Konteks otomatis hilang setelah 30 menit tidak aktif",
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

/**
 * OPTIMASI: Hapus selectRelevantData() — tidak ada lagi extra API call.
 * Langsung pakai top 5 hasil keyword search dari searchKnowledge().
 * Keyword search sudah cukup akurat dan jauh lebih cepat.
 */
async function getAIResponse(
  question,
  data,
  env,
  conversationHistory = [],
  xtallData = null,
) {
  const hasKey =
    env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY_2 || env.GEMINI_API_KEY_3;

  if (!hasKey) {
    if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    }
    return "⚠️ GEMINI_API_KEY_1 belum diset! Tambahkan di Cloudflare Workers → Settings → Variables & Secrets";
  }

  try {
    // Ambil top 5 hasil keyword search langsung (tidak pakai AI selector)
    const topData = data.slice(0, 5);

    // Build context dari knowledge base
    const kbContext = topData
      .map((item) => `Q: ${item.question}\nA: ${item.answer}`)
      .join("\n\n");

    // Build context dari xtall data jika ada
    let xtallContext = "";
    if (xtallData && xtallData.length > 0) {
      xtallContext =
        "\n\n=== DATA XTALL/CRYSTA ===\n" +
        xtallData
          .map((x) => {
            const stats = x.stats
              .map(
                (s) =>
                  `${s.stat}${s.amount !== undefined ? ": " + s.amount : ""}`,
              )
              .join(", ");
            const sources = x.sources
              ? x.sources.map((s) => `${s.monster} @ ${s.map}`).join(" | ")
              : "-";
            const upgradeFor = x.usedFor?.upgradeFor
              ? `Upgrade dari: ${x.usedFor.upgradeFor.join(", ")}`
              : "";
            const upgradeInto = x.usedFor?.upgradeInto
              ? `Upgrade ke: ${x.usedFor.upgradeInto.join(", ")}`
              : "";
            return `[${x.category?.toUpperCase() || x.type}] ${x.name}\nStats: ${stats}\nDrop: ${sources}\n${upgradeFor}${upgradeInto ? "\n" + upgradeInto : ""}`;
          })
          .join("\n\n");
    }

    const fullContext = kbContext + xtallContext;

    const prompt = fullContext
      ? `Berikut data dari database Toram Online:\n\n${fullContext}\n\n---\nPertanyaan: ${question}`
      : `Pertanyaan: ${question}`;

    const result = await callGeminiWithRotation(
      prompt,
      env,
      conversationHistory,
    );
    return result.text;
  } catch (error) {
    console.error("❌ Gemini AI Error:", error.message);
    if (data.length > 0) {
      return `🤖 **Dari database (AI tidak tersedia):**\n\n${data[0].answer}`;
    }
    return `❌ ${error.message}`;
  }
}

// ============================================
// XTALL DATA FETCHER (GitHub Private Repo)
// ============================================

/**
 * OPTIMASI: Kategori xtall ditentukan pakai keyword (detectXtallCategories),
 * bukan API call ke Gemini. Hemat 1 API call per pertanyaan xtall.
 */
async function fetchXtallData(env, question) {
  if (!env.GITHUB_RAW_BASE) {
    console.warn("⚠️ GITHUB_RAW_BASE belum diset");
    return null;
  }

  try {
    const categoriesToFetch = detectXtallCategories(question);
    console.log(`📦 Fetching xtall kategori: ${categoriesToFetch.join(", ")}`);

    const fetched = [];
    for (const cat of categoriesToFetch) {
      try {
        const url = `${env.GITHUB_RAW_BASE}/${cat}.json`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          console.warn(`⚠️ Gagal fetch ${cat}.json: ${res.status}`);
          fetched.push([]);
          continue;
        }
        const data = await res.json();
        fetched.push(data.map((item) => ({ ...item, category: cat })));
      } catch (err) {
        console.error(`❌ Error fetch ${cat}.json:`, err.message);
        fetched.push([]);
      }
    }

    const allXtall = fetched.flat();
    console.log(`✅ Total xtall loaded: ${allXtall.length}`);

    // Langsung return semua, biarkan AI yang filter & analisis
    return allXtall;
  } catch (err) {
    console.error("❌ fetchXtallData error:", err.message);
    return null;
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
