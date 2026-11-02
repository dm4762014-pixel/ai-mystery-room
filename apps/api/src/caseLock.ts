import type { RequestHandler } from "express";

// The deployed service has one API instance, as required by its in-process job runner.
// Serialize progress and final grading so a simultaneous hint/discovery cannot alter
// the score after its final snapshot. Completed requests remove their queue entry.
const tails = new Map<string, Promise<void>>();
export const serializeCaseMutation: RequestHandler = async (
  request,
  response,
  next,
) => {
  const key = String(request.params.caseId);
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(key, current);
  await previous;
  let released = false;
  const finish = () => {
    if (released) return;
    released = true;
    release();
    if (tails.get(key) === current) tails.delete(key);
  };
  response.once("finish", finish);
  response.once("close", finish);
  if (response.destroyed) finish();
  else next();
};
