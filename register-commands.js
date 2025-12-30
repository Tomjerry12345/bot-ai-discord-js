import dotenv from "dotenv";

dotenv.config();

const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// ============================================
// SLASH COMMANDS - ENHANCED WITH CONTEXT
// ============================================

const commands = [
  {
    name: "tanya",
    description: "Tanya ke AI tentang Toram Online",
    options: [
      {
        name: "pertanyaan",
        description: "Pertanyaan kamu",
        type: 3,
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
        type: 3,
        required: true,
      },
      {
        name: "jawaban",
        description: "Jawaban",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "context",
    description:
      "Ajari AI definisi istilah khusus (contoh: ASPD = kecepatan serangan)",
    options: [
      {
        name: "istilah",
        description:
          "Istilah/singkatan yang mau diajari (contoh: ASPD, DPS, MTL)",
        type: 3,
        required: true,
      },
      {
        name: "definisi",
        description:
          "Arti sebenarnya (contoh: Attack Speed, kecepatan serangan)",
        type: 3,
        required: true,
      },
      {
        name: "kategori",
        description: "Kategori: senjata, stats, skills, crystal, monster, umum",
        type: 3,
        required: false,
        choices: [
          { name: "Stats & Atribut", value: "stats" },
          { name: "Senjata & Equipment", value: "senjata" },
          { name: "Skills & Abilities", value: "skills" },
          { name: "Crystal & Xtall", value: "crystal" },
          { name: "Monster & Boss", value: "monster" },
          { name: "Umum", value: "umum" },
        ],
      },
    ],
  },
  {
    name: "contexts",
    description: "Lihat daftar context/istilah yang AI sudah pahami",
    options: [
      {
        name: "kategori",
        description: "Filter berdasarkan kategori (opsional)",
        type: 3,
        required: false,
        choices: [
          { name: "Stats & Atribut", value: "stats" },
          { name: "Senjata & Equipment", value: "senjata" },
          { name: "Skills & Abilities", value: "skills" },
          { name: "Crystal & Xtall", value: "crystal" },
          { name: "Monster & Boss", value: "monster" },
          { name: "Umum", value: "umum" },
        ],
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
        type: 3,
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
        type: 4,
        required: true,
      },
      {
        name: "pertanyaan_baru",
        description: "Pertanyaan baru (opsional)",
        type: 3,
        required: false,
      },
      {
        name: "jawaban_baru",
        description: "Jawaban baru (opsional)",
        type: 3,
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
        type: 4,
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
        type: 4,
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
// VALIDATION & REGISTRATION
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

async function registerCommands() {
  console.log("🚀 Discord Bot Command Registration - Enhanced\n");

  const validationErrors = validateConfig();

  if (validationErrors.length > 0) {
    console.error("⚠️  CONFIGURATION ERROR\n");
    validationErrors.forEach((error) => console.error(error));
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
      console.log("   🎓 /teach - Ajari bot Q&A");
      console.log("   📚 /context - Ajari istilah/definisi (BARU!)");
      console.log("   📖 /contexts - Lihat semua context (BARU!)");
      console.log("   🔍 /cari - Cari Q&A dengan nomor");
      console.log("   ✏️  /edit - Edit Q&A (Admin)");
      console.log("   📋 /list - Lihat semua Q&A");
      console.log("   🗑️  /delete - Hapus Q&A (Admin)");
      console.log("   ❓ /help - Panduan\n");

      console.log("💡 Contoh penggunaan Context:");
      console.log(
        '   /context istilah:ASPD definisi:"Attack Speed, kecepatan serangan karakter" kategori:stats'
      );
      console.log(
        '   /context istilah:MTL definisi:"Metal, jenis material untuk crafting" kategori:umum'
      );
      console.log(
        '   /context istilah:DPS definisi:"Damage Per Second, damage yang dihasilkan per detik" kategori:stats'
      );
      console.log("");
      console.log("🎯 Kegunaan Context:");
      console.log("   • AI akan menggunakan definisi yang kamu ajarkan");
      console.log("   • Mencegah AI salah paham istilah game");
      console.log("   • Semua user bisa mengajarkan context baru");
      console.log("   • Context akan otomatis dipakai saat /tanya\n");
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

      if (response.status === 401) {
        console.error("\n🔐 Authentication failed!");
        console.error("   → Check DISCORD_BOT_TOKEN di .env");
      } else if (response.status === 404) {
        console.error("\n🔍 Application not found!");
        console.error("   → Check DISCORD_APP_ID di .env");
      }

      process.exit(1);
    }
  } catch (error) {
    console.error("❌ UNEXPECTED ERROR\n");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

registerCommands();
