#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7c98edf163a75d955cacca515e7688e4883b34b9975d757946e05a6214d8f454/contract';
import startContract from '../../snapshots/7c98edf163a75d955cacca515e7688e4883b34b9975d757946e05a6214d8f454/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ed191a74dd4889609e4408fa851add40999ee8b5c2aa430a224079730d56a502/contract';
import endContract from '../../snapshots/ed191a74dd4889609e4408fa851add40999ee8b5c2aa430a224079730d56a502/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('pushToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_pushToken_key',
        columns: ['pushToken'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
