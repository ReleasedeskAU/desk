/**
 * GitHub owner/name values used in StaffLess config. Refuse anything that is not a repo slug.
 */

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export type GithubRepoRef = { owner: string; name: string; fullName: string };

export type GithubRepoSelection = {
  owner: string;
  names: string[];
  allRepos: boolean;
};

/**
 * Normalize owner/name. Returns null when the value is not a GitHub repo slug.
 */
export function normalizeGithubRepo(raw: unknown): GithubRepoRef | null {
  if (typeof raw !== "string") return null;
  const fullName = raw.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
  const parts = fullName.split("/");
  if (parts.length !== 2) return null;
  const owner = parts[0];
  const name = parts[1];
  if (!OWNER_PATTERN.test(owner) || !NAME_PATTERN.test(name) || name === "." || name === "..") return null;
  return { owner, name, fullName: `${owner}/${name}` };
}

/**
 * Unique, allow-listed repos from the wizard, grouped by owner.
 * @throws Error when a value is not owner/name or owners are mixed without grouping.
 */
export function parseGithubRepoSelection(config?: Record<string, unknown>): GithubRepoSelection {
  if (config?.allRepos === true) {
    const ownerRaw = typeof config.repoOwner === "string" ? config.repoOwner.trim() : "";
    if (!OWNER_PATTERN.test(ownerRaw)) {
      throw new Error("GitHub needs a token and at least one repository");
    }
    return { owner: ownerRaw, names: [], allRepos: true };
  }

  const fromList = Array.isArray(config?.repos) ? config.repos : null;
  if (fromList) {
    return selectionFromRefs(fromList.map((item) => normalizeGithubRepo(item)));
  }

  const single = normalizeGithubRepo(config?.repo);
  if (single) return { owner: single.owner, names: [single.name], allRepos: false };

  const ownerRaw = typeof config?.repoOwner === "string" ? config.repoOwner.trim() : "";
  const namesRaw = typeof config?.repositories === "string" ? config.repositories : "";
  if (OWNER_PATTERN.test(ownerRaw) && namesRaw.trim()) {
    const names = namesRaw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return selectionFromRefs(names.map((name) => normalizeGithubRepo(`${ownerRaw}/${name}`)));
  }

  throw new Error("GitHub needs a token and at least one repository");
}

/**
 * Group selected full names by owner for one StaffLess connector per owner.
 */
export function groupGithubReposByOwner(fullNames: string[]): GithubRepoSelection[] {
  const grouped = new Map<string, string[]>();
  for (const raw of fullNames) {
    const ref = normalizeGithubRepo(raw);
    if (!ref) throw new Error("Each GitHub repository must be owner/name");
    const names = grouped.get(ref.owner) ?? [];
    if (!names.includes(ref.name)) names.push(ref.name);
    grouped.set(ref.owner, names);
  }
  return [...grouped.entries()].map(([owner, names]) => ({ owner, names, allRepos: false }));
}

function selectionFromRefs(refs: Array<GithubRepoRef | null>): GithubRepoSelection {
  const owners = new Set<string>();
  const names: string[] = [];
  for (const ref of refs) {
    if (!ref) throw new Error("Each GitHub repository must be owner/name");
    owners.add(ref.owner);
    if (!names.includes(ref.name)) names.push(ref.name);
  }
  if (owners.size !== 1 || names.length === 0) {
    throw new Error("GitHub needs a token and at least one repository");
  }
  return { owner: [...owners][0], names, allRepos: false };
}
