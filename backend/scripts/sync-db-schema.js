/**
 * Sync Mongoose-defined indexes with MongoDB (no document deletes).
 *
 *   cd backend && npm run db:sync
 *
 * Loads every `*.js` in `src/models/`, then runs `Model.syncIndexes()` per registered model.
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');

const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

const MODELS_DIR = path.join(__dirname, '../src/models');

function pad(s, w) {
    const str = String(s);
    if (str.length >= w) return str.slice(0, w - 1) + '…';
    return str + ' '.repeat(w - str.length);
}

function printTable(rows) {
    const colModel = 36;
    const colStatus = 10;
    const colMsg = 48;
    const top = `${C.cyan}${C.bold}+${'-'.repeat(colModel + 2)}+${'-'.repeat(colStatus + 2)}+${'-'.repeat(colMsg + 2)}+${C.reset}`;
    const header = `${C.cyan}${C.bold}| ${pad('Model', colModel)} | ${pad('Status', colStatus)} | ${pad('Message', colMsg)} |${C.reset}`;
    console.log(top);
    console.log(header);
    console.log(`${C.cyan}${C.bold}+${'-'.repeat(colModel + 2)}+${'-'.repeat(colStatus + 2)}+${'-'.repeat(colMsg + 2)}+${C.reset}`);

    for (const r of rows) {
        const ok = r.ok;
        const statusText = ok ? 'OK' : 'FAIL';
        const statusCol = ok ? `${C.green}${C.bold}` : `${C.red}${C.bold}`;
        const msg = (r.msg || '').replace(/\s+/g, ' ').slice(0, colMsg);
        console.log(
            `${C.gray}|${C.reset} ${pad(r.name, colModel)} ${C.gray}|${C.reset} `
                + `${statusCol}${pad(statusText, colStatus)}${C.reset} ${C.gray}|${C.reset} `
                + `${ok ? C.dim : C.yellow}${pad(msg, colMsg)}${C.reset} ${C.gray}|${C.reset}`
        );
    }
    console.log(`${C.cyan}${C.bold}+${'-'.repeat(colModel + 2)}+${'-'.repeat(colStatus + 2)}+${'-'.repeat(colMsg + 2)}+${C.reset}`);
}

async function main() {
    if (!process.env.MONGO_URI) {
        console.error(`${C.red}MONGO_URI is not set in .env${C.reset}`);
        process.exit(1);
    }

    console.log(`${C.cyan}${C.bold}[db:sync]${C.reset} Connecting to ${C.dim}${process.env.MONGO_URI}${C.reset}`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${C.green}Connected.${C.reset}\n`);

    const files = fs
        .readdirSync(MODELS_DIR)
        .filter((f) => f.endsWith('.js') && !f.startsWith('.'))
        .sort();

    for (const file of files) {
        const abs = path.join(MODELS_DIR, file);
        require(abs);
    }

    const names = [...mongoose.modelNames()].sort();
    const rows = [];

    for (const name of names) {
        const Model = mongoose.model(name);
        try {
            await Model.syncIndexes();
            rows.push({ name, ok: true, msg: 'syncIndexes() completed' });
        } catch (err) {
            rows.push({
                name,
                ok: false,
                msg: err && err.message ? err.message : String(err)
            });
        }
    }

    printTable(rows);

    const failed = rows.filter((r) => !r.ok).length;
    console.log();
    if (failed === 0) {
        console.log(`${C.green}${C.bold}All ${rows.length} model(s) synced successfully.${C.reset}`);
    } else {
        console.log(`${C.yellow}${C.bold}Finished with ${failed} failure(s) out of ${rows.length} model(s).${C.reset}`);
    }

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
    console.error(`${C.red}[db:sync] Fatal${C.reset}`, err);
    try {
        await mongoose.disconnect();
    } catch (_) { /* ignore */ }
    process.exit(1);
});
