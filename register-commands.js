import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ============================================
// CONFIGURATION - DARI .ENV
// ============================================

const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

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
    name: "cari",
    description: "Cari Q&A berdasarkan kata kunci (dengan nomor urut)",
    options: [
      {
        name: "kata_kunci",
        description: "Kata kunci yang ingin dicari",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "edit",
    description: "Edit Q&A yang sudah ada (Admin only)",
    options: [
      {
        name: "nomor",
        description: "Nomor Q&A yang mau diedit (lihat di /cari atau /list)",
        type: 4, // INTEGER
        required: true,
      },
      {
        name: "pertanyaan_baru",
        description: "Pertanyaan baru (opsional)",
        type: 3, // STRING
        required: false,
      },
      {
        name: "jawaban_baru",
        description: "Jawaban baru (opsional)",
        type: 3, // STRING
        required: false,
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
    name: "reset",
    description: "Hapus memori percakapan kamu (mulai obrolan baru dengan AI)",
  },
  {
    name: "stats",
    description: "Lihat statistik bot (Admin only)",
  },
  {
    name: "help",
    description: "Lihat panduan bot",
  },
];

// ============================================
// VALIDATION
// ============================================

function validateConfig() {
  const errors = [];

  if (!DISCORD_APP_ID || DISCORD_APP_ID.trim() === "") {
    errors.push("❌ DISCORD_APP_ID tidak ditemukan di .env");
  }

  if (!DISCORD_BOT_TOKEN || DISCORD_BOT_TOKEN.trim() === "") {
    errors.push("❌ DISCORD_BOT_TOKEN tidak ditemukan di .env");
  }

  if (DISCORD_APP_ID && !/^\d+$/.test(DISCORD_APP_ID)) {
    errors.push("❌ DISCORD_APP_ID harus berisi angka saja");
  }

  if (DISCORD_BOT_TOKEN && DISCORD_BOT_TOKEN.length < 50) {
    errors.push("❌ DISCORD_BOT_TOKEN sepertinya tidak valid (terlalu pendek)");
  }

  return errors;
}

function showSetupInstructions() {
  console.log("\n📝 SETUP INSTRUCTIONS\n");
  console.log("1️⃣  Install dependencies:");
  console.log("   npm install dotenv\n");

  console.log("2️⃣  Buat file .env di folder yang sama dengan script ini:");
  console.log("   touch .env\n");

  console.log("3️⃣  Isi file .env dengan format berikut:\n");
  console.log("─────────────────────────────────────");
  console.log("DISCORD_APP_ID=1234567890123456789");
  console.log(
    "DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.GaBcDe.FgHiJkLmNoPqRsTuVwXyZ123456789",
  );
  console.log("─────────────────────────────────────\n");

  console.log("4️⃣  Cara dapat credentials:\n");
  console.log("   🔗 Buka: https://discord.com/developers/applications");
  console.log("   📱 Pilih aplikasi bot kamu");
  console.log('   🆔 Application ID → Tab "General Information"');
  console.log('   🤖 Bot Token → Tab "Bot" → Click "Reset Token"\n');

  console.log("5️⃣  Jalankan lagi script ini:");
  console.log("   node register-commands.js\n");
}

// ============================================
// REGISTER COMMANDS
// ============================================

async function registerCommands() {
  console.log("🚀 Discord Bot Command Registration\n");

  const validationErrors = validateConfig();

  if (validationErrors.length > 0) {
    console.error("⚠️  CONFIGURATION ERROR\n");
    validationErrors.forEach((error) => console.error(error));
    showSetupInstructions();
    process.exit(1);
  }

  console.log("✅ Configuration loaded from .env");
  console.log(`📱 App ID: ${DISCORD_APP_ID}`);
  console.log(`🔑 Token: ${DISCORD_BOT_TOKEN.substring(0, 20)}...`);
  console.log("");

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
      result.forEach((cmd, idx) => {
        console.log(`   ${idx + 1}. /${cmd.name} - ${cmd.description}`);
      });

      console.log("\n🎉 Bot siap dipakai!\n");
      console.log("📝 Fitur utama:");
      console.log("   💬 /tanya - Tanya ke AI");
      console.log("   🎓 /teach - Ajari bot");
      console.log("   🔍 /cari - Cari Q&A dengan nomor");
      console.log("   ✏️  /edit - Edit Q&A (Admin)");
      console.log("   🔄 /reset - Reset memori percakapan");
      console.log("   📊 /stats - Lihat statistik (Admin)");
      console.log("   📋 /list - Lihat semua Q&A");
      console.log("   🗑️  /delete - Hapus Q&A (Admin)");
      console.log("   ❓ /help - Panduan\n");

      console.log("💡 Tips:");
      console.log("   • Gunakan /cari untuk menemukan nomor Q&A");
      console.log("   • Gunakan nomor tersebut untuk /edit atau /delete");
      console.log('   • Admin perlu permission "Manage Messages"');
      console.log("   • Gunakan /reset jika AI salah mengingat konteks\n");
    } else {
      const errorText = await response.text();
      let errorData;

      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      console.error("❌ REGISTRATION FAILED\n");
      console.error("Status:", response.status, response.statusText);
      console.error("Error:", JSON.stringify(errorData, null, 2));
      console.error("");

      if (response.status === 401) {
        console.error("🔐 Authentication failed!");
        console.error("   → Check DISCORD_BOT_TOKEN di .env");
        console.error("   → Token mungkin expired atau invalid");
        console.error("   → Generate token baru di Discord Developer Portal\n");
      } else if (response.status === 404) {
        console.error("🔍 Application not found!");
        console.error("   → Check DISCORD_APP_ID di .env");
        console.error("   → Pastikan Application ID benar\n");
      } else if (response.status === 429) {
        console.error("⏱️  Rate limited!");
        console.error("   → Tunggu beberapa menit sebelum mencoba lagi\n");
      }

      process.exit(1);
    }
  } catch (error) {
    console.error("❌ UNEXPECTED ERROR\n");
    console.error("Error:", error.message);
    console.error("");

    if (error.message.includes("fetch")) {
      console.error("🌐 Network error!");
      console.error("   → Check koneksi internet");
      console.error("   → Discord API mungkin sedang down\n");
    }

    process.exit(1);
  }
}

// ============================================
// RUN
// ============================================

registerCommands();
