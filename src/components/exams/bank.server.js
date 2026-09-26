// SERVER-ONLY: counts of the bundled practice bank (local practice mode).
// Only counts cross to the client — never questions or answer keys.
import { loadLocalBank } from "@/lib/exams/local-bank";
import { summarizeQuestions } from "./bank";

export async function localBankSummary() {
  try {
    const bank = await loadLocalBank();
    return summarizeQuestions(bank.list, "local");
  } catch {
    return null;
  }
}
