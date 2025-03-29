import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// -------------------- S3 Static Website Setup --------------------

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

// -------------------- ECS with OIDC Authentication --------------------

// Create a VPC
const vpc = new aws.ec2.Vpc("my-vpc", {
    cidrBlock: "10.0.0.0/16", // Adjust CIDR as needed
    enableDnsSupport: true,
    enableDnsHostnames: true,
    tags: {
        Name: "my-vpc",
    },
});

// Create a subnet
const subnet = new aws.ec2.Subnet("my-subnet", {
    vpcId: vpc.id,
    cidrBlock: "10.0.1.0/24", // Adjust CIDR as needed
    availabilityZone: "us-east-1a", // Adjust as needed
    mapPublicIpOnLaunch: true,
    tags: {
        Name: "my-subnet",
    },
});

// Create a Security Group
const securityGroup = new aws.ec2.SecurityGroup("my-sg", {
    vpcId: vpc.id,
    egress: [{
        cidrBlocks: ["0.0.0.0/0"],
        fromPort: 0,
        toPort: 0,
        protocol: "tcp",
    }],
    ingress: [{
        cidrBlocks: ["0.0.0.0/0"],
        fromPort: 80,
        toPort: 80,
        protocol: "tcp",
    }],
});

// Create an ECS Cluster
const cluster = new aws.ecs.Cluster("my-cluster");

// IAM role for ECS tasks using OIDC (OpenID Connect)
const role = new aws.iam.Role("my-ecs-task-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Federated: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
        },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:sub": "repo:myorg/myrepo:ref:refs/heads/main" // Make sure this matches your GitHub repo
          }
        }
      }
    ]
  }),
});

// Attach policies to the role
const policyAttachment = new aws.iam.RolePolicyAttachment("my-ecs-policy-attachment", {
  role: role,
  policyArn: "arn:aws:iam::aws:policy/AmazonECS_FullAccess",
});

// Use the role in an ECS Task Definition
const taskDefinition = new aws.ecs.TaskDefinition("my-task-definition", {
  family: "my-task",
  networkMode: "awsvpc",
  containerDefinitions: JSON.stringify([{
    name: "my-container",
    image: "my-docker-image", // Replace with your Docker image name
    memory: 512,
    cpu: 256,
    essential: true,
  }]),
  executionRoleArn: role.arn,
  taskRoleArn: role.arn,
});

// Create an ECS Service with Network Configuration
const service = new aws.ecs.Service("my-ecs-service", {
  cluster: cluster.id,
  taskDefinition: taskDefinition.arn,
  desiredCount: 1,
  networkConfiguration: {
    assignPublicIp: true,
    subnets: [subnet.id],
    securityGroups: [securityGroup.id],
  },
});

// Export ECS service details
export const clusterName = cluster.name;
export const taskDefinitionName = taskDefinition.family;
export const serviceName = service.name;
