/**
 * Script untuk register slash commands ke Discord
 * Jalankan: node register-commands.js
 */

// ============================================
// CONFIGURATION - ISI DULU!
// ============================================

const DISCORD_APP_ID = "1333873166434570312"; // Dari Discord Developer Portal
const DISCORD_BOT_TOKEN =
  "MTMzMzg3MzE2NjQzNDU3MDMxMg.GNjTuM.YLpTRtu59Akv3TXyoqRXt1VIJv0nDsqLLINFpo"; // Bot token

// ============================================
// SLASH COMMANDS DEFINITION
// ============================================

const commands = [
  {
    name: "tanya",
    description: "Tanya ke AI tentang Toram Online",
    options: [
      {
        name: "pertanyaan",
        description: "Pertanyaan kamu",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "teach",
    description: "Ajari bot dengan Q&A baru",
    options: [
      {
        name: "pertanyaan",
        description: "Pertanyaan",
        type: 3, // STRING
        required: true,
      },
      {
        name: "jawaban",
        description: "Jawaban",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "list",
    description: "Lihat daftar Q&A yang tersimpan",
    options: [
      {
        name: "page",
        description: "Nomor halaman (default: 1)",
        type: 4, // INTEGER
        required: false,
      },
    ],
  },
  {
    name: "delete",
    description: "Hapus Q&A berdasarkan nomor (Admin only)",
    options: [
      {
        name: "nomor",
        description: "Nomor Q&A yang mau dihapus",
        type: 4, // INTEGER
        required: true,
      },
    ],
  },
  {
    name: "help",
    description: "Lihat panduan bot",
  },
];

// ============================================
// REGISTER COMMANDS
// ============================================

async function registerCommands() {
  if (
    DISCORD_APP_ID === "YOUR_APP_ID_HERE" ||
    DISCORD_BOT_TOKEN === "YOUR_BOT_TOKEN_HERE"
  ) {
    console.error("❌ Error: Isi dulu DISCORD_APP_ID dan DISCORD_BOT_TOKEN!");
    console.log("\n📝 Cara dapat credentials:");
    console.log("1. Buka https://discord.com/developers/applications");
    console.log("2. Pilih aplikasi bot kamu");
    console.log('3. Application ID ada di tab "General Information"');
    console.log('4. Bot Token ada di tab "Bot"');
    return;
  }

  const url = `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/commands`;

  try {
    console.log("🔄 Registering slash commands...\n");

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ Slash commands berhasil diregister!\n");
      console.log("📋 Commands yang teregister:");
      result.forEach((cmd) => {
        console.log(`   - /${cmd.name}`);
      });
      console.log("\n🎉 Bot siap dipakai!\n");
    } else {
      const error = await response.text();
      console.error("❌ Error:", error);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

registerCommands();
