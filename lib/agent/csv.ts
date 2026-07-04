import "server-only";

export type CsvRecord = {
  rowNumber: number;
  values: Record<string, string>;
};

type ParseCsvRecordsOptions = {
  allowOverflowInLastColumn?: boolean;
};

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotedField = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (inQuotedField) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotedField = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotedField = true;
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (character !== "\r") {
      field += character;
    }
  }

  if (inQuotedField) {
    throw new CsvParseError("CSV content has invalid quoting.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((parsedRow) =>
    parsedRow.some((parsedField) => parsedField.trim().length > 0),
  );
}

export function parseCsvRecords(
  content: string,
  requiredHeaders: string[],
  options: ParseCsvRecordsOptions = {},
): CsvRecord[] {
  const [headers, ...rows] = parseCsvRows(content);

  if (!headers || headers.length === 0) {
    throw new CsvParseError("CSV content is empty.");
  }

  const normalizedHeaders = headers.map((header) => header.trim());
  const headerSet = new Set(normalizedHeaders);
  const missingHeader = requiredHeaders.find((header) => !headerSet.has(header));

  if (missingHeader) {
    throw new CsvParseError(`CSV content is missing required field: ${missingHeader}.`);
  }

  return rows.map((row, rowIndex) => {
    if (row.length < normalizedHeaders.length) {
      throw new CsvParseError(
        `CSV row ${rowIndex + 2} has an unexpected field count.`,
      );
    }

    if (row.length > normalizedHeaders.length && !options.allowOverflowInLastColumn) {
      throw new CsvParseError(
        `CSV row ${rowIndex + 2} has an unexpected field count.`,
      );
    }

    const normalizedRow =
      row.length > normalizedHeaders.length
        ? [
            ...row.slice(0, normalizedHeaders.length - 1),
            row.slice(normalizedHeaders.length - 1).join(",").trim(),
          ]
        : row;

    return {
      rowNumber: rowIndex + 2,
      values: normalizedHeaders.reduce<Record<string, string>>(
        (record, header, index) => {
          record[header] = normalizedRow[index]?.trim() ?? "";
          return record;
        },
        {},
      ),
    };
  });
}
