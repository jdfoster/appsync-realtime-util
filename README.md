# AppSync Real-Time Utility

A CLI utility for listening to real-time events emitted from an AppSync
Subscription query. This tool creates a WebSocket and requests subscriptions
using the AWS `graph-ws` protocol ([AWS Real Time Docs]), and follows process
denoted by the AWS Amplify resources [AWSAppSyncRealTimeProvider] and
[GraphQLAPIClass].

## Starting listener

At present, this tool is hard-coded to create a single subscript to POC messages
AppSync resource. _This is expected to evolve into a single executable binary in
the near future._

```sh
deno run --unstable --allow-net --allow-env ./src/mod.ts
```

[AWS Real Time Docs]: https://docs.aws.amazon.com/appsync/latest/devguide/real-time-websocket-client.html
[AWSAppSyncRealTimeProvider]: https://github.com/aws-amplify/amplify-js/blob/dedd5641dfcfce209433088fe9570874cd810997/packages/pubsub/src/Providers/AWSAppSyncRealTimeProvider.ts#L145
[GraphQLAPIClass]: https://github.com/aws-amplify/amplify-js/blob/dedd5641dfcfce209433088fe9570874cd810997/packages/api-graphql/src/GraphQLAPI.ts#L43
