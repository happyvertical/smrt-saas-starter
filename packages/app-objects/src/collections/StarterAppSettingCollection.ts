import { SmrtCollection } from "@happyvertical/smrt-core";
import { StarterAppSetting } from "../models/StarterAppSetting.js";

export class StarterAppSettingCollection extends SmrtCollection<StarterAppSetting> {
  static readonly _itemClass = StarterAppSetting;

  async findByKey(key: string): Promise<StarterAppSetting | null> {
    const settings = await this.list({ where: { key }, limit: 1 });
    return settings[0] ?? null;
  }
}
