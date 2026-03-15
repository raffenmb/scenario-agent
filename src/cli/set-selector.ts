import { checkbox } from '@inquirer/prompts';
import * as readline from 'readline';

interface ProtocolSet {
  name: string;
  protocolCount: number;
}

export interface SetSelection {
  selectedSets: string[];
  priorityOrder: string[];
}

export async function selectProtocolSets(
  sets: ProtocolSet[]
): Promise<SetSelection> {
  if (sets.length === 0) {
    throw new Error('No protocol sets available.');
  }

  if (sets.length === 1) {
    console.log(`  Using protocol set: ${sets[0].name} (${sets[0].protocolCount} protocols)`);
    return {
      selectedSets: [sets[0].name],
      priorityOrder: [sets[0].name],
    };
  }

  const selected = await checkbox({
    message: 'Select protocol sets for this scenario:',
    choices: sets.map((s) => ({
      name: `${s.name} (${s.protocolCount} protocols)`,
      value: s.name,
      checked: true,
    })),
  });

  if (selected.length === 0) {
    throw new Error('At least one protocol set must be selected.');
  }

  if (selected.length === 1) {
    return {
      selectedSets: selected,
      priorityOrder: selected,
    };
  }

  // Priority ordering
  console.log('\n  Assign priority order (highest priority first):');
  console.log('  Current order:');
  selected.forEach((name, i) => console.log(`    ${i + 1}. ${name}`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const reorder = await new Promise<string>((resolve) => {
    rl.question('  Enter new order (e.g., "2,1,3") or press Enter to keep: ', resolve);
  });
  rl.close();

  let priorityOrder = selected;
  if (reorder.trim()) {
    const indices = reorder.split(',').map((s) => parseInt(s.trim()) - 1);
    if (indices.length === selected.length && indices.every((i) => i >= 0 && i < selected.length)) {
      priorityOrder = indices.map((i) => selected[i]);
    } else {
      console.log('  Invalid order, keeping original.');
    }
  }

  console.log('  Priority order:');
  priorityOrder.forEach((name, i) => console.log(`    ${i + 1}. ${name}`));

  return {
    selectedSets: selected,
    priorityOrder,
  };
}
