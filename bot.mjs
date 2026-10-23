/**
 * ===============================================================
 *            VOZNEST XP FARMING & LEVELING BOT (HYBRID)
 * ===============================================================
 * Módulos integrados:
 *  1. Sistema de Niveles y XP (Leveling Engine) con persistencia local
 *     - Gana XP al chatear (15-25 XP con cooldown de 60s)
 *     - Anuncios visuales de Level-Up con Embeds
 *     - Comandos: /rank, /leaderboard, /give-xp
 *  2. Módulo de Auto-Farming periódico
 *     - Envío automático de mensajes con tiempo aleatorio (jitter)
 *     - Comandos: /farm-start, /farm-stop, /farm-status
 *  3. Comandos de utilidad: /ping, /help
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { botFromEnv, loadEnv, embed, button, select, row } from "./voznest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
await loadEnv(join(__dirname, ".env"));

const bot = botFromEnv();

// ===============================================================
//                BASE DE DATOS Y PERSISTENCIA DE XP
// ===============================================================
const DB_FILE = join(__dirname, "xp_database.json");

let db = {
  users: {},
  settings: {
    cooldownSeconds: 60,
    minXp: 15,
    maxXp: 25,
    notifyLevelUp: true
  }
};

function loadDatabase() {
  if (existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(readFileSync(DB_FILE, "utf-8"));
      db = { ...db, ...data };
    } catch (err) {
      console.error("[DB] Error al cargar la base de datos:", err.message);
    }
  }
}

function saveDatabase() {
  try {
    writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("[DB] Error al guardar la base de datos:", err.message);
  }
}

loadDatabase();

// Fórmulas de XP y niveles
function xpRequiredForLevel(level) {
  if (level <= 0) return 0;
  let total = 0;
  for (let i = 0; i < level; i++) {
    total += 5 * (i ** 2) + 50 * i + 100;
  }
  return total;
}

function getLevelFromXp(xp) {
  let level = 0;
  while (true) {
    const nextReq = xpRequiredForLevel(level + 1);
    if (xp >= nextReq) {
      level++;
    } else {
      break;
    }
  }
  return level;
}

function makeProgressBar(current, target, length = 10) {
  const ratio = Math.min(Math.max(current / (target || 1), 0), 1);
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${Math.floor(ratio * 100)}%`;
}

// ===============================================================
//                 ESTADO Y LÓGICA DE AUTO-FARMING
// ===============================================================
const FARM_MESSAGES = [
  "Hey everyone! Hope you're having an awesome day.",
  "Good vibes all around!",
  "Anyone down for some matches later?",
  "Great game earlier, that was fun!",
  "Checking in, keeping the hub active!",
  "What is everyone playing today?",
  "GG to all the players!",
  "Loving the community discussions here.",
  "Let's keep the activity going!",
  "Active grind never stops!",
  "¡Saludos a todos en la comunidad!",
  "¡Que tengan un excelente día!",
  "¿Quién para jugar unas partidas luego?",
  "¡Excelente ambiente por aquí!",
  "¡Seguimos activos sumando XP!"
];

let farmState = {
  active: false,
  channelId: process.env.AUTO_FARM_CHANNEL_ID || null,
  minSec: parseInt(process.env.AUTO_FARM_MIN_SEC || "65", 10),
  maxSec: parseInt(process.env.AUTO_FARM_MAX_SEC || "95", 10),
  timer: null,
  nextRunAt: null,
  sentCount: 0,
  startedAt: null
};

function getRandomDelay(minSec, maxSec) {
  const min = minSec * 1000;
  const max = maxSec * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomMessage() {
  return FARM_MESSAGES[Math.floor(Math.random() * FARM_MESSAGES.length)];
}

function scheduleNextFarm() {
  if (!farmState.active || !farmState.channelId) return;

  const delayMs = getRandomDelay(farmState.minSec, farmState.maxSec);
  farmState.nextRunAt = Date.now() + delayMs;

  farmState.timer = setTimeout(async () => {
    if (!farmState.active) return;
    try {
      const msg = getRandomMessage();
      await bot.send(farmState.channelId, msg);
      farmState.sentCount++;
      console.log(`[Auto-Farm #${farmState.sentCount}] Enviado en ${farmState.channelId}: "${msg}"`);
    } catch (err) {
      console.error("[Auto-Farm Error]:", err.message);
    }
    scheduleNextFarm();
  }, delayMs);
}

function startFarming(channelId, minSec = 65, maxSec = 95) {
  if (farmState.active) return false;
  farmState.active = true;
  farmState.channelId = channelId;
  farmState.minSec = Math.max(10, minSec);
  farmState.maxSec = Math.max(farmState.minSec, maxSec);
  farmState.startedAt = Date.now();
  farmState.sentCount = 0;
  scheduleNextFarm();
  return true;
}

function stopFarming() {
  if (!farmState.active) return false;
  farmState.active = false;
  if (farmState.timer) clearTimeout(farmState.timer);
  farmState.timer = null;
  farmState.nextRunAt = null;
  return true;
}

// ===============================================================
//                       COMANDOS SLASH
// ===============================================================

/* ── /rank [who] ── Consulta tu rango, nivel y progreso de XP */
bot.command(
  {
    name: "rank",
    description: "Consulta tu nivel, XP actual y posición en el ranking",
    options: [
      { type: "user", name: "who", description: "Usuario a consultar (opcional)", required: false }
    ]
  },
  async (ctx) => {
    const targetUser = ctx.option("who") || ctx.user;
    const userId = targetUser.id;
    const userData = db.users[userId] || { xp: 0, level: 0, messages: 0 };

    const currentLevel = userData.level;
    const currentXp = userData.xp;
    const currentLevelBaseXp = xpRequiredForLevel(currentLevel);
    const nextLevelReqXp = xpRequiredForLevel(currentLevel + 1);

    const xpInCurrentLevel = currentXp - currentLevelBaseXp;
    const xpNeededForNext = nextLevelReqXp - currentLevelBaseXp;
    const bar = makeProgressBar(xpInCurrentLevel, xpNeededForNext, 12);

    // Calcular posición en el ranking
    const sorted = Object.entries(db.users).sort((a, b) => b[1].xp - a[1].xp);
    const rankIndex = sorted.findIndex(([id]) => id === userId);
    const rankPos = rankIndex !== -1 ? `#${rankIndex + 1}` : "Sin rango";

    const card = embed()
      .color("violet")
      .title(`📊 Perfil de Nivel · ${targetUser.displayName || targetUser.username || "Usuario"}`)
      .field("Nivel", `${currentLevel}`, true)
      .field("Posición", `${rankPos}`, true)
      .field("Mensajes", `${userData.messages || 0}`, true)
      .field("Progreso al Nivel " + (currentLevel + 1), `${xpInCurrentLevel} / ${xpNeededForNext} XP\n\`${bar}\``, false)
      .field("XP Total", `${currentXp.toLocaleString()} XP`, true)
      .timestamp();

    if (targetUser.avatarUrl) {
      card.thumbnail(targetUser.avatarUrl);
    }

    return ctx.reply({ embeds: [card] });
  }
);

/* ── /leaderboard ── Top 10 de usuarios con más nivel y XP */
bot.command(
  {
    name: "leaderboard",
    description: "Tabla de clasificación con los 10 mejores del hub"
  },
  async (ctx) => {
    const sorted = Object.entries(db.users)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    if (sorted.length === 0) {
      return ctx.reply({
        embeds: [embed().color("cyan").title("🏆 Leaderboard").description("Aún no hay registros de XP en este hub. ¡Sé el primero en chatear!")]
      });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = sorted.map(([id, u], index) => {
      const medal = medals[index] || `**#${index + 1}**`;
      const name = u.displayName || u.username || `<@${id}>`;
      return `${medal} ${name} — **Nvl ${u.level}** (${u.xp.toLocaleString()} XP)`;
    });

    const card = embed()
      .color("amber")
      .title("🏆 Clasificación de XP del Hub")
      .description(lines.join("\n\n"))
      .timestamp();

    return ctx.reply({ embeds: [card] });
  }
);

/* ── /give-xp [who] [amount] ── Otorga o ajusta XP manualmente (Admin) */
bot.command(
  {
    name: "give-xp",
    description: "Otorga XP a un usuario (Solo Administradores)",
    requiredPermission: "manageMessages",
    options: [
      { type: "user", name: "who", description: "Usuario que recibirá XP", required: true },
      { type: "integer", name: "amount", description: "Cantidad de XP a sumar", required: true }
    ]
  },
  async (ctx) => {
    const target = ctx.option("who");
    const amount = Number(ctx.option("amount"));

    if (isNaN(amount) || amount <= 0) {
      return ctx.fail("Por favor especifica una cantidad de XP válida mayor que 0.");
    }

    const userId = target.id;
    if (!db.users[userId]) {
      db.users[userId] = {
        xp: 0,
        level: 0,
        messages: 0,
        lastMessageAt: 0,
        displayName: target.displayName || target.username,
        username: target.username
      };
    }

    db.users[userId].xp += amount;
    db.users[userId].level = getLevelFromXp(db.users[userId].xp);
    saveDatabase();

    return ctx.reply({
      embeds: [
        embed()
          .color("green")
          .title("✨ XP Otorgada")
          .description(`Se han añadido **+${amount} XP** a <@${target.id}>.\nNuevo Total: **${db.users[userId].xp} XP** (Nivel ${db.users[userId].level}).`)
      ]
    });
  }
);

/* ── /farm-start [channel] [min_sec] [max_sec] ── Inicia el auto-farming */
bot.command(
  {
    name: "farm-start",
    description: "Inicia el ciclo automático de mensajes para farming",
    requiredPermission: "manageMessages",
    options: [
      { type: "channel", name: "channel", description: "Canal destino (opcional, por defecto el actual)", required: false },
      { type: "integer", name: "min_sec", description: "Segundos mínimos de espera (def: 65)", required: false },
      { type: "integer", name: "max_sec", description: "Segundos máximos de espera (def: 95)", required: false }
    ]
  },
  async (ctx) => {
    if (farmState.active) {
      return ctx.fail(`El auto-farming ya está activo en el canal <#${farmState.channelId}>.`);
    }

    const targetChannel = ctx.option("channel");
    const channelId = targetChannel?.id || ctx.channelId;
    const minSec = Number(ctx.option("min_sec")) || 65;
    const maxSec = Number(ctx.option("max_sec")) || 95;

    if (minSec < 10) {
      return ctx.fail("El intervalo mínimo recomendado es de 60s para no infringir límites.");
    }

    startFarming(channelId, minSec, maxSec);

    return ctx.reply({
      embeds: [
        embed()
          .color("green")
          .title("🌾 Auto-Farming Iniciado")
          .description(`Farming activo en el canal <#${channelId}>.\nIntervalo aleatorio: entre **${minSec}s** y **${maxSec}s**.`)
      ]
    });
  }
);

/* ── /farm-stop ── Detiene el auto-farming */
bot.command(
  {
    name: "farm-stop",
    description: "Detiene el ciclo automático de farming",
    requiredPermission: "manageMessages"
  },
  async (ctx) => {
    if (!farmState.active) {
      return ctx.fail("El auto-farming no se encuentra activo.");
    }

    const sent = farmState.sentCount;
    stopFarming();

    return ctx.reply({
      embeds: [
        embed()
          .color("red")
          .title("🛑 Auto-Farming Detenido")
          .description(`El ciclo de farming ha finalizado.\nMensajes enviados en esta sesión: **${sent}**.`)
      ]
    });
  }
);

/* ── /farm-status ── Muestra el estado del auto-farming */
bot.command(
  {
    name: "farm-status",
    description: "Verifica el estado del auto-farming y estadísticas"
  },
  async (ctx) => {
    const card = embed().color(farmState.active ? "green" : "slate");

    if (farmState.active) {
      const remainingSec = farmState.nextRunAt ? Math.max(0, Math.round((farmState.nextRunAt - Date.now()) / 1000)) : 0;
      const uptimeSec = Math.round((Date.now() - farmState.startedAt) / 1000);

      card
        .title("🌾 Estado de Auto-Farming: ACTIVO")
        .field("Canal", `<#${farmState.channelId}>`, true)
        .field("Mensajes enviados", `${farmState.sentCount}`, true)
        .field("Próximo envío en", `${remainingSec} segundos`, true)
        .field("Rango de intervalo", `${farmState.minSec}s - ${farmState.maxSec}s`, true)
        .field("Tiempo activo", `${uptimeSec}s`, true);
    } else {
      card
        .title("🌾 Estado de Auto-Farming: INACTIVO")
        .description("El módulo de auto-farming está detenido. Usa `/farm-start` para activarlo.");
    }

    return ctx.reply({ embeds: [card] });
  }
);

/* ── /ping ── Diagnóstico de conectividad */
bot.command(
  {
    name: "ping",
    description: "Comprueba que el bot está activo y mide la latencia"
  },
  async (ctx) => {
    const start = Date.now();
    await ctx.defer();
    const rtt = await bot.ping();
    return ctx.reply({
      embeds: [
        embed()
          .color("cyan")
          .title("🏓 Pong!")
          .field("Gateway", `${rtt} ms`, true)
          .field("API Latency", `${Date.now() - start} ms`, true)
      ]
    });
  }
);

/* ── /help ── Lista y guía de comandos */
bot.command(
  {
    name: "help",
    description: "Muestra la lista de comandos disponibles y su funcionamiento"
  },
  async (ctx) => {
    const card = embed()
      .color("violet")
      .title("📖 Guía de Comandos · XP Farming Bot")
      .field("🏆 Sistema de Niveles", "• `/rank [who]`: Tu tarjeta de nivel, XP y barra de progreso.\n• `/leaderboard`: Los 10 miembros con más XP del hub.\n• `/give-xp [who] [amount]`: Asigna XP manualmente (Admin).", false)
      .field("🌾 Módulo de Auto-Farming", "• `/farm-start`: Inicia el envío automático en un canal.\n• `/farm-stop`: Pausa el auto-farming.\n• `/farm-status`: Consulta el estado actual y temporizador.", false)
      .field("⚙️ Diagnóstico", "• `/ping`: Revisa la latencia con el Gateway de Voznest.", false)
      .timestamp();

    return ctx.reply({ embeds: [card] });
  }
);

// ===============================================================
//               EVENTO GATEWAY: ASIGNACIÓN DE XP
// ===============================================================
bot.on("MESSAGE_CREATE", async ({ message, author }) => {
  // Ignorar bots o mensajes sin autor
  if (!author || author.bot) return;

  const userId = author.id;
  const now = Date.now();
  const cooldownMs = (db.settings.cooldownSeconds || 60) * 1000;

  if (!db.users[userId]) {
    db.users[userId] = {
      xp: 0,
      level: 0,
      messages: 0,
      lastMessageAt: 0,
      displayName: author.displayName || author.username,
      username: author.username
    };
  }

  const user = db.users[userId];
  user.messages = (user.messages || 0) + 1;
  user.displayName = author.displayName || author.username;
  user.username = author.username;

  // Comprobar cooldown anti-spam
  if (now - user.lastMessageAt < cooldownMs) {
    saveDatabase();
    return;
  }

  // Asignar XP aleatorio entre minXp y maxXp
  const earnedXp = Math.floor(Math.random() * (db.settings.maxXp - db.settings.minXp + 1)) + db.settings.minXp;
  user.xp += earnedXp;
  user.lastMessageAt = now;

  const previousLevel = user.level || 0;
  const newLevel = getLevelFromXp(user.xp);

  // Comprobar si subió de nivel
  if (newLevel > previousLevel) {
    user.level = newLevel;
    saveDatabase();

    if (db.settings.notifyLevelUp && message?.channelId) {
      try {
        const levelEmbed = embed()
          .color("amber")
          .title("🎉 ¡Subida de Nivel!")
          .description(`¡Enhorabuena <@${userId}>! Has alcanzado el **Nivel ${newLevel}** 🚀\nXP Total: **${user.xp.toLocaleString()} XP**`)
          .timestamp();

        await bot.send(message.channelId, { embeds: [levelEmbed] });
      } catch (err) {
        console.error("[Level-Up Notification Error]:", err.message);
      }
    }
  } else {
    saveDatabase();
  }
});

// ===============================================================
//                       INICIO DEL BOT
// ===============================================================
bot.on("ready", () => {
  console.log(`[XP Bot] Conectado exitosamente.`);
  bot.setActivity({ type: "playing", name: "/rank | /help" });

  // Iniciar auto-farm si está configurado en el .env
  if (process.env.AUTO_FARM_ENABLED === "true" && process.env.AUTO_FARM_CHANNEL_ID) {
    console.log(`[Auto-Farm] Iniciando desde configuración .env en canal ${process.env.AUTO_FARM_CHANNEL_ID}`);
    startFarming(
      process.env.AUTO_FARM_CHANNEL_ID,
      parseInt(process.env.AUTO_FARM_MIN_SEC || "65", 10),
      parseInt(process.env.AUTO_FARM_MAX_SEC || "95", 10)
    );
  }
});

console.log("[XP Bot] Sincronizando comandos y conectando al gateway...");
await bot.start();
