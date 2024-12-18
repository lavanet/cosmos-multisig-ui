export const timestampFromDatetimeLocal = (
  datetimeLocal: string,
  units: "s" | "ms" | "ns",
): bigint => {
  const [date, time] = datetimeLocal.split("T");
  const [year, month, day] = date.split("-");
  const [hours, minutes] = time.split(":");

  const dateObj = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  );

  const timestampMillis = BigInt(dateObj.getTime());

  switch (units) {
    case "s":
      return timestampMillis / 1000n; // seconds
    case "ns":
      return timestampMillis * 1000_000n; // nanoseconds
    case "ms":
      return timestampMillis; // milliseconds
    default:
      throw new Error("Unexpected unit value");
  }
};
export const datetimeLocalFromTimestamp = (
  timestampParam: bigint | number,
  unit: "ns" | "ms" | "s" = "ms",
): string => {
  let normalizedTimestamp;
  const timestamp = BigInt(timestampParam);

  switch (unit) {
    case "s":
      normalizedTimestamp = timestamp * 1_000n;
      break;
    case "ms":
      normalizedTimestamp = timestamp;
      break;
    case "ns":
    default:
      normalizedTimestamp = timestamp / 1_000_000n;
      break;
  }

  const date = new Date(Number(normalizedTimestamp)); // Convert BigInt to Number for Date

  const month = date.getMonth() + 1; // It's 0-indexed
  const monthStr = month < 10 ? `0${month}` : String(month);

  const day = date.getDate();
  const dayStr = day < 10 ? `0${day}` : String(day);

  const hours = date.getHours();
  const hoursStr = hours < 10 ? `0${hours}` : String(hours);

  const minutes = date.getMinutes();
  const minutesStr = minutes < 10 ? `0${minutes}` : String(minutes);

  return `${date.getFullYear()}-${monthStr}-${dayStr}T${hoursStr}:${minutesStr}`;
};
