import { respondWithUnsupportedGit } from '../lib/git-shared.js';

export default function handler(_req: any, res: any) {
  respondWithUnsupportedGit(res, 'POST');
}
