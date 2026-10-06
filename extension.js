// Claude + Codex Cost — shows what Claude Code and Codex cost since the 1st of the month.
// Numbers come from ccusage (bundled native binary), which reads the local logs
// (~/.claude, ~/.codex) and applies public API prices. It is an estimate, not a bill.
const vscode = require('vscode');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const REFRESH_MS = 5 * 60 * 1000;
const FR = vscode.env.language.startsWith('fr');

const T = FR ? {
  loading: 'Coût IA…',
  title: m => `**Coût depuis le 1er ${m}**`,
  head: '| | Coût | Volume |',
  total: 'Total',
  note: 'Estimation au tarif API public (ccusage), pas la facture réelle. Ce poste uniquement.',
  updated: t => `Mis à jour à ${t} — clic pour rafraîchir.`,
  unsupported: 'Plateforme non prise en charge',
} : {
  loading: 'AI cost…',
  title: m => `**Cost since ${m} 1**`,
  head: '| | Cost | Volume |',
  total: 'Total',
  note: 'Estimate at public API prices (ccusage), not your actual bill. This machine only.',
  updated: t => `Updated ${t} — click to refresh.`,
  unsupported: 'Unsupported platform',
};

let item;
let timer;

function binary() {
  const dir = path.join(__dirname, 'vendor', `${process.platform}-${process.arch}`, 'bin');
  const bin = path.join(dir, process.platform === 'win32' ? 'ccusage.exe' : 'ccusage');
  if (!fs.existsSync(bin)) return null;
  if (process.platform !== 'win32') {
    try { fs.chmodSync(bin, 0o755); } catch {}
  }
  return bin;
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
}

function run(bin, agent) {
  return new Promise(resolve => {
    execFile(bin, [agent, 'monthly', '--json', '--since', firstOfMonth()],
      { timeout: 60000, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const t = JSON.parse(stdout).totals || {};
          resolve({ cost: t.totalCost ?? t.costUSD ?? 0, tokens: t.totalTokens ?? 0 });
        } catch {
          resolve(null);
        }
      });
  });
}

const locale = FR ? 'fr-FR' : 'en-US';
const usd = n => n == null ? '—' : (FR
  ? `${Math.round(n).toLocaleString(locale)} $`
  : `$${Math.round(n).toLocaleString(locale)}`);
const mtok = n => `${(n / 1e6).toLocaleString(locale, { maximumFractionDigits: 0 })}M tokens`;

async function refresh() {
  const bin = binary();
  if (!bin) {
    item.text = `$(credit-card) ${T.unsupported}`;
    return;
  }
  item.text = `$(sync~spin) ${T.loading}`;
  const [claude, codex] = await Promise.all([run(bin, 'claude'), run(bin, 'codex')]);
  const total = (claude?.cost ?? 0) + (codex?.cost ?? 0);
  item.text = `$(credit-card) Claude ${usd(claude?.cost)} · Codex ${usd(codex?.cost)}`;

  const month = new Date().toLocaleDateString(locale, { month: 'long' });
  const time = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`${T.title(month)}\n\n${T.head}\n|---|---:|---:|\n`);
  md.appendMarkdown(`| Claude Code | ${usd(claude?.cost)} | ${claude ? mtok(claude.tokens) : '—'} |\n`);
  md.appendMarkdown(`| Codex | ${usd(codex?.cost)} | ${codex ? mtok(codex.tokens) : '—'} |\n`);
  md.appendMarkdown(`| **${T.total}** | **${usd(total)}** | |\n\n`);
  md.appendMarkdown(`${T.note} ${T.updated(time)}`);
  item.tooltip = md;
}

function activate(context) {
  item = vscode.window.createStatusBarItem('claudeCodexCost', vscode.StatusBarAlignment.Right, 1000);
  item.name = 'Claude + Codex Cost';
  item.command = 'claudeCodexCost.refresh';
  item.show();
  context.subscriptions.push(item, vscode.commands.registerCommand('claudeCodexCost.refresh', refresh));
  refresh();
  timer = setInterval(refresh, REFRESH_MS);
}

function deactivate() {
  clearInterval(timer);
}

module.exports = { activate, deactivate };
