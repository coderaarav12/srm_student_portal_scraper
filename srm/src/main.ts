import { DirectSrmScraper } from "../cloudflare/src/scraper.js";
import readline from "readline";
import fs from "fs";
import path from "path";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("================================================================================");
  console.log("       SRM Portal Scraper v2.3 (Attendance, Marks, SGPA, Internal Marks)        ");
  console.log("================================================================================\n");

  const args = process.argv.slice(2);
  let netId = "";
  let pass = "";
  let manualCaptcha = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--netId" && args[i + 1]) netId = args[++i];
    if (args[i] === "--password" && args[i + 1]) pass = args[++i];
    if (args[i] === "--captcha" && args[i + 1]) manualCaptcha = args[++i];
  }

  if (!netId) netId = await prompt("Enter NetID (e.g. ag0892): ");
  if (!pass) pass = await prompt("Enter Password: ");

  console.log("\n[1/3] Establishing secure portal session and fetching CAPTCHA...");
  const session = await DirectSrmScraper.fetchCaptchaSession();

  const tempDir = path.resolve("./temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const captchaPath = path.join(tempDir, "current_captcha.png");
  fs.writeFileSync(captchaPath, Buffer.from(session.captchaImageBase64!, "base64"));
  console.log(`[+] CAPTCHA image saved to: ${captchaPath}`);

  if (!manualCaptcha) {
    console.log("\nPlease open the image above and solve the 6-character captcha.");
    manualCaptcha = await prompt("Enter CAPTCHA: ");
  }

  console.log("\n[2/3] Authenticating and extracting all student reports...");
  try {
    const result = await DirectSrmScraper.submitLoginAndScrape(
      session,
      netId,
      pass,
      manualCaptcha
    );

    console.log("\n[3/3] Reports fetched successfully!\n");
    
    console.log("================================================================================");
    console.log(result.attendanceOutput);
    console.log("================================================================================\n");

    console.log("================================================================================");
    console.log(result.internalMarksOutput);
    console.log("================================================================================\n");

    console.log("================================================================================");
    console.log(result.marksOutput);
    console.log("================================================================================");

    const outDir = path.resolve("./output");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    
    const outJsonPath = path.join(outDir, `student_data_${netId}.json`);
    fs.writeFileSync(
      outJsonPath,
      JSON.stringify(
        {
          netId,
          attendance: result.attendance,
          internalMarks: result.internalMarks,
          marks: result.marks,
          unifiedSubjects: result.unifiedSubjects,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    console.log(`\n[+] Full student data JSON saved to: ${outJsonPath}`);
  } catch (err) {
    console.error(`\n[-] Login / Scrape Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch(console.error);
