import { Probot } from "probot";
const { convertAll } = require("bpmn-to-image");
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import axios, { AxiosResponse } from "axios";
import path from "path";

const IMAGE_UPLOAD_KEY = process.env.IMAGE_UPLOAD_KEY;
const root = __dirname + path.sep + "tmp";

export = (app: Probot) => {
  app.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async (context) => {
      const files = await context.octokit.pulls.listFiles({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        pull_number: context.payload.pull_request.number,
      });
      const bpmnFiles = files.data.filter((file) =>
        file.filename.endsWith(".bpmn")
      );

      if (bpmnFiles.length === 0) {
        return;
      }
      

      // console.log(bpmnFiles);
      try {
        const uploadedFiles = await Promise.all(
          bpmnFiles.map(async (file) => {
            let oldContentSha;
            if (file.status === "modified") {
              // console.log("Got old content");
              const oldContent = await context.octokit.repos.getContent({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                path: file.filename,
                ref: context.payload.pull_request.base.sha,
              });
              oldContentSha = (oldContent.data as any).sha as string;
            }

            // Getting Content
            const fileContent = await context.octokit.git.getBlob({
              file_sha: file.sha,
              owner: context.payload.repository.owner.login,
              repo: context.payload.repository.name,
            });

            // console.log(`${root}/${file.filename}`);
            const inputFile = `${root}/${file.filename}`;
            const outputFile = `${root}/${file.filename.replace(
              ".bpmn",
              ".png"
            )}`;
            
            mkdirSync(root, { recursive: true });

            checkFolders(file.filename);

            await writeFile(inputFile, fileContent.data.content);

            await convertBmpnFiles(inputFile, outputFile);


            const response = await uploadFile(outputFile);

            if (oldContentSha) {
              const oldFileContent = await context.octokit.git.getBlob({
                file_sha: oldContentSha,
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
              });

              await writeFile(inputFile, oldFileContent.data.content, true);

              await convertBmpnFiles(
                inputFile.replace(".bpmn", " old.bpmn"),
                outputFile.replace(".bpmn", " old.bpmn")
              );

              const oldResponse = await uploadFile(outputFile, true);

              return `#### ${file.filename} **${file.status}**\n${
                file.status === "modified"
                  ? `\`\`\`diff\n${file.patch}\n\`\`\``
                  : ""
              }\n\nOld:\n![image](${
                oldResponse.data.fileUrl
              })\n\nNew:\n![image](${response.data.fileUrl})`;
            }

            return `#### ${file.filename} **${file.status}**\n${
              file.status === "modified"
                ? `\`\`\`diff\n${file.patch}\n\`\`\``
                : ""
            }\n\n![image](${response.data.fileUrl})`;
          })
        );

        const body = uploadedFiles.join("\n\n");

        await context.octokit.issues.createComment({
          body,
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          issue_number: context.payload.pull_request.number,
        });

        rmSync(root, { recursive: true });
      } catch (error) {
        console.log(error);
      }
    }
  );
};

async function convertBmpnFiles(inputFile: string, outputFile: string) {
  await convertAll([
    {
      input: inputFile,
      outputs: [outputFile],
    },
  ]);
}

async function writeFile(
  fileName: string,
  content: string,
  old: boolean = false
) {
  await writeFileSync(
    old ? fileName.replace(".bpmn", " old.bpmn") : fileName,
    content,
    {
      encoding: "base64",
    }
  );
}

async function uploadFile(
  fileName: string,
  old: boolean = false
): Promise<AxiosResponse<any, any>> {
  const file = readFileSync(
    old ? fileName.replace(".bpmn", " old.bpmn") : fileName
  );

  return await axios.post(
    "https://api.upload.io/v2/accounts/FW25ayp/uploads/binary",
    file,
    {
      headers: {
        "Content-Type": "image/png",
        Authorization: `Bearer ${IMAGE_UPLOAD_KEY}`,
      },
    }
  );
}

function checkFolders(fileName: string) {
  const folders = fileName.split(path.sep).slice(0, -1);

  if (folders.length) {
    // create folder path if it doesn't exist
    folders.reduce((last, folder) => {
      const folderPath = last + path.sep + folder + path.sep;
      // console.log("FOLDER PATH2:", folderPath);

      if (!existsSync(folderPath)) {
        mkdirSync(folderPath);
      }
      return folderPath;
    }, root);
  }
}
