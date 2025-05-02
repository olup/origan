import { customAlphabet } from "nanoid";

export const generateReference = (length = 10) => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return customAlphabet(alphabet)(length);
};
