import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

type MismatchReport = {
  label: string;
  csvPath: string;
  dirPath: string;
};

const REPORTS: MismatchReport[] = [
  {
    label: 'transaction unit mismatches',
    csvPath: path.join(__dirname, '../../data/transactions/_unit-mismatches/unit-mismatches.csv'),
    dirPath: path.join(__dirname, '../../data/transactions/_unit-mismatches'),
  },
  {
    label: 'material unit mismatches',
    csvPath: path.join(__dirname, '../../data/materials/_unit-mismatches/unit-mismatches.csv'),
    dirPath: path.join(__dirname, '../../data/materials/_unit-mismatches'),
  },
];

function countMismatchRows(csvPath: string): number {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Mismatch report not found: ${csvPath}\nRun "npm run compare:units" first.`);
  }

  const lines = fs
    .readFileSync(csvPath, 'utf-8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error(`Mismatch report is empty: ${csvPath}\nRun "npm run compare:units" first.`);
  }

  return Math.max(lines.length - 1, 0);
}

async function confirmCompareUnitsWasRun(scriptLabel: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nBefore seeding, run "npm run compare:units" and review these reports:');
    for (const report of REPORTS) {
      console.log(`  - ${report.dirPath}`);
    }
    console.log(`This ${scriptLabel} script will stop if any unit mismatches are still present.`);
    const answer = (
      await rl.question('Did you already run "npm run compare:units" and review the mismatch reports? Type "yes" to continue: ')
    ).trim();

    if (answer !== 'yes') {
      throw new Error(`Aborted. Please run "npm run compare:units" before "${scriptLabel}".`);
    }
  } finally {
    rl.close();
  }
}

export async function ensureNoUnitMismatchesBeforeSeeding(scriptLabel: string): Promise<void> {
  await confirmCompareUnitsWasRun(scriptLabel);

  const blockingReports = REPORTS.map((report) => ({
    ...report,
    mismatchRows: countMismatchRows(report.csvPath),
  })).filter((report) => report.mismatchRows > 0);

  if (blockingReports.length > 0) {
    const details = blockingReports
      .map((report) => `- ${report.label}: ${report.mismatchRows} row(s) in ${report.csvPath}`)
      .join('\n');

    throw new Error(`Unit mismatches must be resolved before seeding.\n${details}`);
  }
}
