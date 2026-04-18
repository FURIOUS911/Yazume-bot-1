const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ]
});

const PREFIX = '!';
const LOG_CHANNEL_NAME = 'logs-modération'; // Crée ce salon sur ton serveur
const warns = {}; // { userId: count }
const spamMap = {}; // anti-spam tracker

// ─── READY ───────────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} est en ligne !`);
  client.user.setActivity('⚔️ Surveillance du serveur', { type: 3 });
});

// ─── ANTI-SPAM ────────────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Anti-spam : 5 messages en 3 secondes → mute 1 min
  const userId = message.author.id;
  if (!spamMap[userId]) spamMap[userId] = [];
  spamMap[userId].push(Date.now());
  spamMap[userId] = spamMap[userId].filter(t => Date.now() - t < 3000);

  if (spamMap[userId].length >= 5) {
    try {
      await message.member.timeout(60_000, 'Anti-spam automatique');
      message.channel.send(`🚫 <@${userId}> a été muté 1 minute pour spam.`);
      logAction(message.guild, '🚫 Anti-Spam', message.author, 'Spam détecté → Timeout 1 min');
    } catch {}
    spamMap[userId] = [];
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const member = message.mentions.members?.first();

  // ─── BAN ─────────────────────────────────────────────────────────────────
  if (command === 'ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply('❌ Tu n\'as pas la permission de bannir.');
    if (!member) return message.reply('❌ Mentionne un membre à bannir.');
    const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
    try {
      await member.ban({ reason });
      message.channel.send(embed('🔨 Ban', member.user, reason, 0xFF0000));
      logAction(message.guild, '🔨 Ban', member.user, reason, message.author);
    } catch { message.reply('❌ Impossible de bannir ce membre.'); }
  }

  // ─── KICK ────────────────────────────────────────────────────────────────
  else if (command === 'kick') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply('❌ Tu n\'as pas la permission de kick.');
    if (!member) return message.reply('❌ Mentionne un membre à kick.');
    const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
    try {
      await member.kick(reason);
      message.channel.send(embed('👢 Kick', member.user, reason, 0xFFA500));
      logAction(message.guild, '👢 Kick', member.user, reason, message.author);
    } catch { message.reply('❌ Impossible de kick ce membre.'); }
  }

  // ─── MUTE (timeout) ──────────────────────────────────────────────────────
  else if (command === 'mute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply('❌ Tu n\'as pas la permission de muter.');
    if (!member) return message.reply('❌ Mentionne un membre à muter.');
    const duree = parseInt(args[1]) || 10; // en minutes
    const reason = args.slice(2).join(' ') || 'Aucune raison fournie';
    try {
      await member.timeout(duree * 60_000, reason);
      message.channel.send(embed(`🔇 Mute (${duree} min)`, member.user, reason, 0xFFFF00));
      logAction(message.guild, `🔇 Mute ${duree} min`, member.user, reason, message.author);
    } catch { message.reply('❌ Impossible de muter ce membre.'); }
  }

  // ─── UNMUTE ──────────────────────────────────────────────────────────────
  else if (command === 'unmute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply('❌ Permission insuffisante.');
    if (!member) return message.reply('❌ Mentionne un membre.');
    try {
      await member.timeout(null);
      message.channel.send(`✅ <@${member.id}> a été démute.`);
      logAction(message.guild, '✅ Unmute', member.user, '-', message.author);
    } catch { message.reply('❌ Impossible de démuter.'); }
  }

  // ─── WARN ────────────────────────────────────────────────────────────────
  else if (command === 'warn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply('❌ Permission insuffisante.');
    if (!member) return message.reply('❌ Mentionne un membre.');
    const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
    if (!warns[member.id]) warns[member.id] = 0;
    warns[member.id]++;
    const count = warns[member.id];
    message.channel.send(embed(`⚠️ Warn (${count}/3)`, member.user, reason, 0xFFA500));
    logAction(message.guild, `⚠️ Warn ${count}/3`, member.user, reason, message.author);

    // Auto-ban à 3 warns
    if (count >= 3) {
      try {
        await member.ban({ reason: '3 warns atteints' });
        message.channel.send(`🔨 <@${member.id}> a été **banni** après 3 avertissements.`);
        warns[member.id] = 0;
      } catch {}
    }
  }

  // ─── WARNS CHECK ─────────────────────────────────────────────────────────
  else if (command === 'warns') {
    if (!member) return message.reply('❌ Mentionne un membre.');
    const count = warns[member.id] || 0;
    message.reply(`⚠️ **${member.user.tag}** a **${count}/3** avertissement(s).`);
  }

  // ─── CLEAR ───────────────────────────────────────────────────────────────
  else if (command === 'clear') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply('❌ Permission insuffisante.');
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100)
      return message.reply('❌ Donne un nombre entre 1 et 100.');
    await message.channel.bulkDelete(amount + 1, true);
    const msg = await message.channel.send(`🗑️ **${amount}** messages supprimés.`);
    setTimeout(() => msg.delete().catch(() => {}), 3000);
  }

  // ─── PUB (MP aux membres du serveur) ─────────────────────────────────────
  else if (command === 'pub') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ Seul un admin peut utiliser cette commande.');
    const lien = args[0];
    if (!lien) return message.reply('❌ Usage : `!pub <lien>`');

    const members = await message.guild.members.fetch();
    let envoyes = 0;
    let echecs = 0;

    message.reply(`📨 Envoi de la pub en cours...`);

    for (const [, m] of members) {
      if (m.user.bot) continue;
      try {
        await m.send(`📢 **Annonce du serveur ${message.guild.name} :**\n\n${lien}`);
        envoyes++;
        await wait(500); // pause pour éviter le rate limit
      } catch {
        echecs++;
      }
    }

    message.channel.send(`✅ Pub envoyée à **${envoyes}** membres. (${echecs} échec(s))`);
  }

  // ─── FUN : 8BALL ─────────────────────────────────────────────────────────
  else if (command === '8ball') {
    const reponses = [
      '🎱 Absolument !', '🎱 Sans aucun doute.', '🎱 Compte dessus.',
      '🎱 Ouais probablement.', '🎱 Je dirais oui.', '🎱 C\'est flou...',
      '🎱 Redemande plus tard.', '🎱 Je préfère pas répondre.',
      '🎱 Très peu probable.', '🎱 Non.', '🎱 Absolument pas !',
    ];
    const question = args.join(' ');
    if (!question) return message.reply('❓ Pose une question après `!8ball`');
    message.reply(`**Question :** ${question}\n${reponses[Math.floor(Math.random() * reponses.length)]}`);
  }

  // ─── FUN : GIFLE ─────────────────────────────────────────────────────────
  else if (command === 'gifle') {
    if (!member) return message.reply('❌ Mentionne quelqu\'un à gifler !');
    message.channel.send(`👋 <@${message.author.id}> a giflé <@${member.id}> en pleine face ! CLAP 💥`);
  }

  // ─── FUN : SHIP ──────────────────────────────────────────────────────────
  else if (command === 'ship') {
    const target = message.mentions.members?.first();
    if (!target) return message.reply('❌ Mentionne quelqu\'un !');
    const pct = Math.floor(Math.random() * 101);
    const bar = '❤️'.repeat(Math.floor(pct / 10)) + '🖤'.repeat(10 - Math.floor(pct / 10));
    message.channel.send(`💘 **${message.author.username}** + **${target.user.username}**\n${bar} **${pct}% de compatibilité**`);
  }

  // ─── FUN : DÉ ────────────────────────────────────────────────────────────
  else if (command === 'roll') {
    const max = parseInt(args[0]) || 6;
    message.reply(`🎲 Tu lances un dé à ${max} faces... **${Math.floor(Math.random() * max) + 1}** !`);
  }

  // ─── AIDE ────────────────────────────────────────────────────────────────
  else if (command === 'aide' || command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📋 Commandes du bot')
      .setColor(0x5865F2)
      .addFields(
        { name: '🔨 Modération', value: '`!ban @user [raison]`\n`!kick @user [raison]`\n`!mute @user [minutes] [raison]`\n`!unmute @user`\n`!warn @user [raison]`\n`!warns @user`\n`!clear [1-100]`' },
        { name: '📢 Pub', value: '`!pub <lien>` — Envoie un MP à tous les membres' },
        { name: '🎉 Fun', value: '`!8ball <question>`\n`!gifle @user`\n`!ship @user`\n`!roll [max]`' },
      )
      .setFooter({ text: 'Bot de modération — Prefix : !' });
    message.channel.send({ embeds: [helpEmbed] });
  }
});

// ─── UTILS ───────────────────────────────────────────────────────────────────
function embed(action, user, reason, color) {
  return {
    embeds: [new EmbedBuilder()
      .setTitle(action)
      .addFields(
        { name: 'Utilisateur', value: `${user.tag}`, inline: true },
        { name: 'Raison', value: reason, inline: true }
      )
      .setColor(color)
      .setTimestamp()]
  };
}

function logAction(guild, action, target, reason, mod) {
  const logChannel = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);
  if (!logChannel) return;
  const e = new EmbedBuilder()
    .setTitle(`📝 ${action}`)
    .addFields(
      { name: 'Cible', value: target.tag, inline: true },
      { name: 'Raison', value: reason, inline: true },
      { name: 'Modérateur', value: mod ? mod.tag : 'Automatique', inline: true }
    )
    .setColor(0x99AAB5)
    .setTimestamp();
  logChannel.send({ embeds: [e] });
}

const wait = (ms) => new Promise(res => setTimeout(res, ms));

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
      
