import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Create an S3 bucket with website hosting enabled
const bucket = new aws.s3.Bucket("my-static-site", {
    website: {
        indexDocument: "index.html",
        errorDocument: "error.html",
    },
});

// Disable public access block to allow public policies
const publicAccessBlock = new aws.s3.BucketPublicAccessBlock("disablePublicAccess", {
    bucket: bucket.id,
    blockPublicAcls: false,
    ignorePublicAcls: false,
    blockPublicPolicy: false, // Allow public policies
    restrictPublicBuckets: false,
});

// Upload the index.html file (without setting ACL)
const indexHtml = new aws.s3.BucketObject("index", {
    bucket: bucket,
    source: new pulumi.asset.FileAsset("index.html"), // Ensure this file exists
    contentType: "text/html",
    acl: undefined, // Remove the ACL from the file object entirely
});

// Define a public bucket policy
const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
    bucket: bucket.id,
    policy: bucket.id.apply(id => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${id}/*`,
        }],
    })),
});

// Export the website URL
export const bucketName = bucket.bucket;
export const websiteUrl = bucket.websiteEndpoint;
