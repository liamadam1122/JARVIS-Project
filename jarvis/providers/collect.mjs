import { linuxExtraReadings } from "./linux.mjs";
import { macExtraReadings } from "./mac.mjs";
import { mergeReadings } from "./common.mjs";
import { windowsExtraReadings } from "./windows.mjs";

export async function mergePlatformReadings(readings, { sampledAt, modelText, platform = process.platform }) {
  let extra = [];
  if (platform === "darwin") extra = await macExtraReadings({ modelText, sampledAt });
  else if (platform === "win32") extra = await windowsExtraReadings({ sampledAt });
  else if (platform === "linux") extra = await linuxExtraReadings({ sampledAt });
  return mergeReadings(readings, extra);
}
