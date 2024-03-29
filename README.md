# bmpn-bot

A GitHub App built with [Probot](https://github.com/probot/probot) 

This bot will add comments with rendered pictures of any modified `bpmn` files in the pull request.

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Docker

```sh
# 1. Build container
docker build -t bmpn-bot .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> bmpn-bot
```

## Contributing

If you have suggestions for how bmpn-bot could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2022 tarazena
