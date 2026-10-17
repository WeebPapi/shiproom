import "server-only";
import { z } from "zod";

const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string(),
  html_url: z.url(),
  default_branch: z.string().nullable(),
  private: z.boolean(),
});

export type PublicRepository = z.infer<typeof repositorySchema>;

export type RepositoryLookup =
  | { ok: true; repository: PublicRepository }
  | { ok: false; reason: "not_found_or_private" | "rate_limited" | "unavailable" };

function githubFetch(path: string) {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "shiproom",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
}

export type PublicRepositoriesState =
  | { status: "ready"; repositories: PublicRepository[] }
  | { status: "rate_limited" | "unavailable" };

/** Public suggestions only; the owner still explicitly approves each team repository. */
export async function listPublicRepositories(login: string): Promise<PublicRepositoriesState> {
  try {
    // shortcut: suggest the 100 most recently updated owned public repos; use owner/name for others until search is needed.
    const response = await githubFetch(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&per_page=100`);
    if (response.status === 403 || response.status === 429) return { status: "rate_limited" };
    if (!response.ok) return { status: "unavailable" };
    const repositories = z.array(repositorySchema).parse(await response.json());
    return { status: "ready", repositories: repositories.filter((repo) => !repo.private) };
  } catch {
    return { status: "unavailable" };
  }
}

/** Unauthenticated read of a public repository. Private context needs the GitHub App (not built yet). */
export async function fetchPublicRepository(fullName: string): Promise<RepositoryLookup> {
  let response: Response;
  try {
    response = await githubFetch(`/repos/${fullName}`);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.status === 404) return { ok: false, reason: "not_found_or_private" };
  if (response.status === 403 || response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: "unavailable" };
  try {
    const repository = repositorySchema.parse(await response.json());
    if (repository.private) return { ok: false, reason: "not_found_or_private" };
    return { ok: true, repository };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
