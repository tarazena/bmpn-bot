import { Probot } from "probot";
const { convertAll } = require("bpmn-to-image");
import { readFileSync, writeFileSync } from "fs";
import axios from "axios";

const IMAGE_UPLOAD_KEY = process.env.IMAGE_UPLOAD_KEY;

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    await context.octokit.issues.createComment(issueComment);
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/

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

      // console.log(bpmnFiles);
      try {
        const uploadedFiles = await Promise.all(
          bpmnFiles.map(async (file) => {
            const fileContent = await context.octokit.git.getBlob({
              file_sha: file.sha,
              owner: context.payload.repository.owner.login,
              repo: context.payload.repository.name,
            });

            console.log(`${__dirname}/${file.filename}`);

            await writeFileSync(
              `${__dirname}/${file.filename}`,
              fileContent.data.content,
              {
                encoding: "base64",
              }
            );
            await convertAll([
              {
                input: `${__dirname}/${file.filename}`,
                outputs: [`${__dirname}/${file.filename.replace(".bpmn", ".png")}`],
              },
            ]);


            const image = readFileSync(
              `${__dirname}/${file.filename.replace(".bpmn", ".png")}`
            );
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

            return { data: response.data.fileUrl, file: file.filename };
          })
        );
        // Add comment
        // await context.octokit.pulls.createReviewComment({
        //   body: "hello",
        //   owner: context.payload.repository.owner.login,
        //   repo: context.payload.repository.name,
        //   pull_number: pull_request.number,
        // });

        const body = uploadedFiles
          .map((resp) => `${resp.file}: ![image](${resp.data})`)
          .join("\n\n");

        console.log(body);
        await context.octokit.issues.createComment({
          body,
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          issue_number: pull_request.number,
        });
      } catch (error) {
        console.log(error);
      }
    }
  );
};
