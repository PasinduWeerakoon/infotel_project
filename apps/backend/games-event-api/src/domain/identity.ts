/**
 * Who is the same person? Plays belong to one person when they share a QuickLook account, a phone
 * number or a name, directly or through other plays (two accounts with the same name and two
 * phones are still one person). Used across the whole event to flag repeat players in the admin.
 * Pure functions, so the rules are easy to test.
 */

/** "  Lasith   ERANDA " and "lasith eranda" are the same name */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface PlayIdentity {
  entryId: string;
  userId: string;
  name: string;
  /** Empty when the player has not given a phone */
  phone: string;
}

/** Groups plays into people. Returns a person key for every play (plays of one person share it). */
export function personKeys(plays: PlayIdentity[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };

  const firstBy = new Map<string, string>();
  for (const play of plays) {
    parent.set(play.entryId, play.entryId);
    const name = normalizeName(play.name);
    const links = [`a:${play.userId}`, play.phone ? `p:${play.phone}` : '', name ? `n:${name}` : ''];
    for (const link of links) {
      if (!link) continue;
      const first = firstBy.get(link);
      if (first) parent.set(find(play.entryId), find(first));
      else firstBy.set(link, play.entryId);
    }
  }
  return new Map(plays.map((p) => [p.entryId, find(p.entryId)]));
}

/** How many plays each play's person made (this one included), by entryId */
export function playsPerPerson(keys: Map<string, string>): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const key of keys.values()) sizes.set(key, (sizes.get(key) ?? 0) + 1);
  return new Map([...keys].map(([entryId, key]) => [entryId, sizes.get(key) ?? 1]));
}
