import {
  aws_ec2,
  Fn,
  Stack,
  StackProps,
  aws_iam,
  aws_elasticloadbalancingv2,
  aws_autoscaling,
  aws_events,
  aws_lambda,
  aws_events_targets,
  Duration,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { join } from "path";
import { readFileSync } from "fs";
import { Ttl } from "pwed-cdk/lib/lib/ttl";

export interface Ipv6AutoscalingStackProps extends StackProps {
    vpc: aws_ec2.CfnVPC;
    publicSubnetA: aws_ec2.CfnSubnet;
    publicSubnetB: aws_ec2.CfnSubnet;
    privateSubnetA: aws_ec2.CfnSubnet;
    privateSubnetB: aws_ec2.CfnSubnet;
}

export class Ipv6AutoscalingStack extends Stack {
  constructor(scope: Construct, id: string, props: Ipv6AutoscalingStackProps) {
    super(scope, id, props);

    // Tear the stack down after 1 hour because I am cheap
    new Ttl(this, "Ttl", {ttl: Duration.hours(1)})

    const vpc = props.vpc;
    const publicSubnetA = props.publicSubnetA;
    const publicSubnetB = props.publicSubnetB;
    const privateSubnetA = props.privateSubnetA;
    const privateSubnetB = props.privateSubnetB;

    const ElasticLoadBalancingV2TargetGroup =
      new aws_elasticloadbalancingv2.CfnTargetGroup(
        this,
        "ElasticLoadBalancingV2TargetGroup",
        {
          port: 80,
          protocol: "HTTP",
          targetType: "ip",
          ipAddressType: "ipv6",
          vpcId: vpc.attrVpcId,
          healthCheckEnabled: true,
          matcher: {
            httpCode: "403",
          },
        }
      );

    const EC2SecurityGroup = new aws_ec2.CfnSecurityGroup(
      this,
      "EC2SecurityGroup",
      {
        groupDescription: "ipv6-test",
        vpcId: vpc.attrVpcId,
        securityGroupIngress: [
          {
            cidrIp: "0.0.0.0/0",
            fromPort: 80,
            ipProtocol: "tcp",
            toPort: 80,
          },
          {
            cidrIpv6: "::/0",
            fromPort: 80,
            ipProtocol: "tcp",
            toPort: 80,
          },
        ],
        securityGroupEgress: [
          {
            cidrIp: "0.0.0.0/0",
            ipProtocol: "-1",
          },
          {
            cidrIpv6: "::/0",
            ipProtocol: "-1",
          },
        ],
      }
    );

    const ElasticLoadBalancingV2LoadBalancer =
      new aws_elasticloadbalancingv2.CfnLoadBalancer(
        this,
        "ElasticLoadBalancingV2LoadBalancer",
        {
          name: ElasticLoadBalancingV2TargetGroup.attrTargetGroupName,
          scheme: "internet-facing",
          type: "application",
          subnets: [publicSubnetA.attrSubnetId, publicSubnetB.attrSubnetId],
          securityGroups: [EC2SecurityGroup.attrGroupId],
          ipAddressType: "dualstack",
        }
      );

    const ElasticLoadBalancingV2Listener =
      new aws_elasticloadbalancingv2.CfnListener(
        this,
        "ElasticLoadBalancingV2Listener",
        {
          loadBalancerArn: ElasticLoadBalancingV2LoadBalancer.ref,
          port: 80,
          protocol: "HTTP",
          defaultActions: [
            {
              targetGroupArn: ElasticLoadBalancingV2TargetGroup.ref,
              type: "forward",
            },
          ],
        }
      );

    const IAMRole = new aws_iam.CfnRole(this, "IAMRole", {
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ec2.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      },
      maxSessionDuration: 3600,
      managedPolicyArns: [
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
      ],
    });

    const iamInstanceProfile = new aws_iam.CfnInstanceProfile(
      this,
      "InstanceProfile",
      {
        roles: [IAMRole.ref],
      }
    );

    const EC2LaunchTemplate = new aws_ec2.CfnLaunchTemplate(
      this,
      "EC2LaunchTemplate",
      {
        launchTemplateData: {
          userData: Fn.base64(
            readFileSync(join(__dirname, "userdata.yaml")).toString()
          ),
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                iops: 3000,
                volumeSize: 10,
                volumeType: "gp3",
                throughput: 125,
              },
            },
            {
              deviceName: "/dev/xvdb",
              virtualName: "ephemeral0",
            },
          ],
          iamInstanceProfile: {
            arn: iamInstanceProfile.attrArn,
          },
          imageId: new aws_ec2.AmazonLinuxImage({
            generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
            cpuType: aws_ec2.AmazonLinuxCpuType.ARM_64,
          }).getImage(this).imageId,
          securityGroupIds: [EC2SecurityGroup.attrGroupId],
        },
      }
    );

    const AutoScalingAutoScalingGroup = new aws_autoscaling.CfnAutoScalingGroup(
      this,
      "AutoScalingAutoScalingGroup",
      {
        mixedInstancesPolicy: {
          launchTemplate: {
            launchTemplateSpecification: {
              launchTemplateId: EC2LaunchTemplate.ref,
              launchTemplateName: EC2LaunchTemplate.launchTemplateName,
              version: EC2LaunchTemplate.attrLatestVersionNumber,
            },
            overrides: [
              {
                instanceType: "m6gd.medium",
                weightedCapacity: "4",
              },
            ],
          },
          instancesDistribution: {
            onDemandAllocationStrategy: "prioritized",
            onDemandBaseCapacity: 0,
            onDemandPercentageAboveBaseCapacity: 100,
            spotAllocationStrategy: "lowest-price",
            spotInstancePools: 2,
          },
        },
        minSize: "0",
        maxSize: "10",
        healthCheckGracePeriod: 60,
        vpcZoneIdentifier: [
          privateSubnetA.attrSubnetId,
          privateSubnetB.attrSubnetId,
        ],
        capacityRebalance: true,
      }
    );

    const lambdaRole = new aws_iam.Role(this, "LambdaRole", {
      assumedBy: new aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
    });

    const lambda = new aws_lambda.Function(this, "AutoscalingFunction", {
      code: aws_lambda.Code.fromAsset(join(__dirname, "lambda")),
      runtime: aws_lambda.Runtime.PYTHON_3_9,
      handler: "handler.handler",
      role: lambdaRole,
      environment: {
        TARGET_GROUP_ARN: ElasticLoadBalancingV2TargetGroup.ref,
      },
    });

    const eventRule = new aws_events.Rule(this, "eventRule", {
      eventPattern: {
        source: ["aws.autoscaling"],
        detailType: [
          "EC2 Instance Launch Successful",
          "EC2 Instance Terminate Successful",
          "EC2 Instance Launch Unsuccessful",
          "EC2 Instance Terminate Unsuccessful",
          "EC2 Instance-launch Lifecycle Action",
          "EC2 Instance-terminate Lifecycle Action",
          "EC2 Auto Scaling Instance Refresh Succeeded",
        ],
        detail: {
          AutoScalingGroupName: [AutoScalingAutoScalingGroup.ref],
        },
      },
    });
    eventRule.node.addDependency(AutoScalingAutoScalingGroup);
    eventRule.addTarget(new aws_events_targets.LambdaFunction(lambda));
  }
}
