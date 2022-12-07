import { Probot } from "probot";
const { convertAll } = require("bpmn-to-image");
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import axios from "axios";
import path from "path";

const IMAGE_UPLOAD_KEY = process.env.IMAGE_UPLOAD_KEY;

export = (app: Probot) => {
  app.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async (context) => {
      const pull_request = context.payload.pull_request;

      const files = await context.octokit.pulls.listFiles({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        pull_number: pull_request.number,
      });
      const bpmnFiles = files.data.filter((file) =>
        file.filename.endsWith(".bpmn")
      );

      if (bpmnFiles.length === 0) {
        return;
      }
      const root = __dirname + path.sep + "tmp";

      console.log(bpmnFiles);
      try {
        const uploadedFiles = await Promise.all(
          bpmnFiles.map(async (file) => {
            let oldContentSha;
            if (file.status === "modified") {
              // console.log("Got old content");
              let oldContent = await context.octokit.repos.getContent({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                path: file.filename,
                ref: pull_request.base.sha,
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

            const folders = file.filename.split(path.sep).slice(0, -1);

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

            await writeFileSync(inputFile, fileContent.data.content, {
              encoding: "base64",
            });

            await convertAll([
              {
                input: inputFile,
                outputs: [outputFile],
              },
            ]);

            const image = readFileSync(outputFile);
            const response = await axios.post(
              "https://api.upload.io/v2/accounts/FW25ayp/uploads/binary",
              image,
              {
                headers: {
                  "Content-Type": "image/png",
                  Authorization: `Bearer ${IMAGE_UPLOAD_KEY}`,
                },
              }
            );

            if (oldContentSha) {
              const oldFileContent = await context.octokit.git.getBlob({
                file_sha: oldContentSha,
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
              });

              await writeFileSync(
                inputFile.replace(".bpmn", " old.bpmn"),
                oldFileContent.data.content,
                {
                  encoding: "base64",
                }
              );

              await convertAll([
                {
                  input: inputFile.replace(".bpmn", " old.bpmn"),
                  outputs: [outputFile.replace(".bpmn", " old.bpmn")],
                },
              ]);

              const oldImage = readFileSync(
                outputFile.replace(".bpmn", " old.bpmn")
              );
              const oldResponse = await axios.post(
                "https://api.upload.io/v2/accounts/FW25ayp/uploads/binary",
                oldImage,
                {
                  headers: {
                    "Content-Type": "image/png",
                    Authorization: `Bearer ${IMAGE_UPLOAD_KEY}`,
                  },
                }
              );

              return `\`${file.filename}\`\n${
                file.status === "modified"
                  ? `\`\`\`\n${file.patch}\n\`\`\``
                  : ""
              }\n\nOld:\n![image](${
                oldResponse.data.fileUrl
              })\n\nNew:\n![image](${response.data.fileUrl})`;
            }

            return `\`${file.filename}\`\n${
              file.status === "modified" ? `\`\`\`\n${file.patch}\n\`\`\`` : ""
            }\n\n![image](${response.data.fileUrl})`;
          })
        );

        const body = uploadedFiles.join("\n\n");

        await context.octokit.issues.createComment({
          body,
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          issue_number: pull_request.number,
        });

        rmSync(root, { recursive: true });
      } catch (error) {
        console.log(error);
      }
    }
  );
};
