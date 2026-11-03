# Web hosting

One CDK stack per web app (`lkdr-{stage}-web-games`, `-hunt`, `-screens`, `-admin`), each deployed on its own.
Each stack: private S3 bucket, CloudFront with security headers, SPA routing, and the app's API paths forwarded
to the shared HTTP API on the same domain (so the sign-in cookie works without CORS).

Build the app first (`npm run build` in its folder), then `npx cdk deploy lkdr-dev-web-games -c stage=dev`.
Custom domains: `-c domain=example.lk -c certificateArn=arn:aws:acm:us-east-1:...`.
