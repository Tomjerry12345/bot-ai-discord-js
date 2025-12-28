/**
 * Toram AI Discord Bot - Cloudflare Workers Edition
 * Slash Commands Version
 */

import { verifyKey } from "discord-interactions";

// ============================================
// CONFIGURATION
// ============================================

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ============================================
// MAIN WORKER
// ============================================

export default {
  async fetch(request, env) {
    // Verify Discord signature
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

    // Handle Discord PING
    if (interaction.type === 1) {
      return jsonResponse({ type: 1 });
    }

    // Handle Slash Commands
    if (interaction.type === 2) {
      return handleCommand(interaction, env);
    }

    return new Response("Unknown interaction type", { status: 400 });
  },
};

// ============================================
// COMMAND HANDLER
// ============================================

async function handleCommand(interaction, env) {
  const { name, options } = interaction.data;

  switch (name) {
    case "tanya":
      return handleTanya(interaction, env);
    case "teach":
      return handleTeach(interaction, env);
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

async function handleTanya(interaction, env) {
  const question = getOptionValue(interaction.data.options, "pertanyaan");

  if (!question || question.length < 3) {
    return jsonResponse({
      type: 4,
      data: { content: "❓ Pertanyaan terlalu pendek!" },
    });
  }

  // Defer reply (karena AI butuh waktu)
  setTimeout(() => followUpResponse(interaction, env, question), 0);

  return jsonResponse({
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  });
}

async function followUpResponse(interaction, env, question) {
  try {
    // Search knowledge base
    const knowledge = await getKnowledge(env);
    const results = searchKnowledge(knowledge, question);

    // Get AI response
    const aiResponse = await getAIResponse(question, results, env);

    // Send follow-up message
    const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}`;

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
      interaction.member.user.username
    );
  } catch (error) {
    console.error("Error:", error);

    const followUpUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${interaction.token}`;
    await fetch(followUpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `❌ Terjadi error: ${error.message}`,
      }),
    });
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

    const fields = qaList.map((qa, idx) => ({
      name: `${start + idx + 1}. ${qa.question.substring(0, 60)}`,
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
              text: `Total: ${total} Q&A | Gunakan /list page:<nomor>`,
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
          content: `❌ Nomor ${index} tidak valid! Lihat pakai \`/list\``,
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
                "`/tanya pertanyaan:<text>` - Tanya ke AI\n`/list [page]` - Lihat semua data",
              inline: false,
            },
            {
              name: "🎓 Mengajari Bot",
              value: "`/teach pertanyaan:<text> jawaban:<text>` - Ajari bot",
              inline: false,
            },
            {
              name: "📊 Database",
              value: "`/delete nomor:<number>` - Hapus data (Admin)",
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
// AI INTEGRATION
// ============================================

async function getAIResponse(question, data, env) {
  if (!env.GROQ_API_KEY) {
    if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    }
    return "⚠️ GROQ_API_KEY belum diset!";
  }

  // Build context
  const context = data
    .slice(0, 15)
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
            content:
              "Kamu AI helper Toram Online. Jawab singkat dan jelas maksimal 300 kata.",
          },
          {
            role: "user",
            content: `DATABASE:\n${context}\n\nPERTANYAAN: ${question}\n\nJawab berdasarkan database di atas.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.choices[0].message.content;
    } else if (data.length > 0) {
      return `🤖 **Dari database:**\n\n${data[0].answer}`;
    } else {
      return "❌ API Error";
    }
  } catch (error) {
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
  const data = await env.TORAM_KV.get("knowledge");
  if (data) {
    return JSON.parse(data);
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
    console.error("Failed to save conversation:", error);
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
