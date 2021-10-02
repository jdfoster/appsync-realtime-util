# AppSync Real-Time Utility

A CLI utility for listening to real-time events emitted from an AWS AppSync
Subscription query. This tool creates a WebSocket and requests subscriptions
using the AWS `graph-ws` protocol ([AWS Real Time Docs]), and follows process
denoted by the AWS Amplify resources [AWSAppSyncRealTimeProvider] and
[GraphQLAPIClass].

## Features

- Multiple query listeners.
- Forwards request headers.
- Console or file logging of captured events.
- Timeout for use in testing scenarios.

## Releases

At present, this tool utilises a handful of unstable Deno APIs and thus may
break with future release of Deno; this tool is know to work with Deno **1.14**.
Once the `Deno.signal` API is stabilised this tool will be built and released a
single executable binary. For the time being this CLI may be used via cloning or
pointing the deno cli to this repository.

```sh
deno run --unstable https://github.com/jdfoster/appsync-realtime-util/blob/main/src/mod.ts
```

## Starting a Listener

This CLI expects the AWS AppSync endpoint to be provided by the environmental
variable `GRAPH_ENDPOINT_URL` and the api key `GRAPH_API_KEY`. _Only
authorisation via API key is currently supported._

```sh
deno run --unstable --allow-net --allow-env ./src/mod.ts -q 'subscription listenerToPosts { onCreatePost(author: "burt") { author post { body } } }'
```

[AWS Real Time Docs]: https://docs.aws.amazon.com/appsync/latest/devguide/real-time-websocket-client.html
[AWSAppSyncRealTimeProvider]: https://github.com/aws-amplify/amplify-js/blob/dedd5641dfcfce209433088fe9570874cd810997/packages/pubsub/src/Providers/AWSAppSyncRealTimeProvider.ts#L145
[GraphQLAPIClass]: https://github.com/aws-amplify/amplify-js/blob/dedd5641dfcfce209433088fe9570874cd810997/packages/api-graphql/src/GraphQLAPI.ts#L43
