import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CsvParseError, parseCsvRecords } from "@/lib/agent/csv";
import type { InvoiceLine } from "@/lib/agent/types";

const fixturePath = join(process.cwd(), "data", "invoice_extraction_fixture.csv");
const requiredFixtureHeaders = [
  "invoice_id",
  "line_number",
  "patient_id",
  "visit_name",
  "item_description_raw",
  "amount_eur",
  "extraction_confidence",
];

type FixtureRow = Record<string, string>;

export class InvoiceExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceExtractionError";
  }
}

function parseFixtureRows(content: string): FixtureRow[] {
  try {
    return parseCsvRecords(content, requiredFixtureHeaders, {
      allowOverflowInLastColumn: true,
    }).map((record) => record.values);
  } catch (error) {
    if (error instanceof CsvParseError) {
      throw new InvoiceExtractionError(
        error.message.replace("CSV content", "Invoice extraction fixture"),
      );
    }

    throw error;
  }
}

function requiredValue(row: FixtureRow, field: string, rowNumber: number): string {
  const value = row[field];

  if (!value) {
    throw new InvoiceExtractionError(
      `Invoice extraction fixture row ${rowNumber} is missing ${field}.`,
    );
  }

  return value;
}

function parseLineNumber(row: FixtureRow, rowNumber: number): number {
  const value = Number.parseInt(requiredValue(row, "line_number", rowNumber), 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new InvoiceExtractionError(
      `Invoice extraction fixture row ${rowNumber} has an invalid line_number.`,
    );
  }

  return value;
}

function parseConfidence(row: FixtureRow, rowNumber: number): number {
  const value = Number.parseFloat(
    requiredValue(row, "extraction_confidence", rowNumber),
  );

  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new InvoiceExtractionError(
      `Invoice extraction fixture row ${rowNumber} has an invalid extraction_confidence.`,
    );
  }

  return value;
}

function mapFixtureRowToInvoiceLine(row: FixtureRow, rowNumber: number): InvoiceLine {
  const lineNumber = parseLineNumber(row, rowNumber);
  const invoiceId = requiredValue(row, "invoice_id", rowNumber);

  return {
    id: `${invoiceId}-line-${lineNumber}`,
    lineNumber,
    patientId: requiredValue(row, "patient_id", rowNumber),
    visitName: requiredValue(row, "visit_name", rowNumber),
    rawDescription: requiredValue(row, "item_description_raw", rowNumber),
    amount: requiredValue(row, "amount_eur", rowNumber),
    extractionConfidence: parseConfidence(row, rowNumber),
  };
}

export async function extractInvoiceLinesFromFixture(): Promise<InvoiceLine[]> {
  let content: string;

  try {
    content = await readFile(fixturePath, "utf8");
  } catch {
    throw new InvoiceExtractionError(
      "Demo invoice extraction fixture is unavailable.",
    );
  }

  const rows = parseFixtureRows(content);

  if (rows.length === 0) {
    throw new InvoiceExtractionError("Invoice extraction fixture has no rows.");
  }

  return rows.map((row, index) => mapFixtureRowToInvoiceLine(row, index + 2));
}
