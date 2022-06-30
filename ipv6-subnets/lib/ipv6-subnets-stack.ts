import {
  aws_ec2,
  Fn,
  Stack,
  StackProps,
  aws_iam,
  aws_elasticloadbalancingv2,
  aws_autoscaling,
  Duration,
  aws_events,
  aws_lambda,
  aws_events_targets,
} from "aws-cdk-lib";
import { ttl } from "pwed-cdk";
import { Construct } from "constructs";
import { join } from "path";
import { readFileSync } from "fs";

export class Ipv6SubnetsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new ttl.Ttl(this, "Ttl", { ttl: Duration.hours(5) });

    const vpc = new aws_ec2.CfnVPC(this, "VPC", {
      cidrBlock: "10.0.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    const ipv6Cidr = new aws_ec2.CfnVPCCidrBlock(this, "IPV6", {
      vpcId: vpc.attrVpcId,
      amazonProvidedIpv6CidrBlock: true,
    });

    const publicSubnetA = new aws_ec2.CfnSubnet(this, "PubSubA", {
      vpcId: vpc.attrVpcId,
      cidrBlock: Fn.select(0, Fn.cidr(vpc.attrCidrBlock, 8, "8")),
      availabilityZone: Fn.select(0, this.availabilityZones),
      assignIpv6AddressOnCreation: true,
      mapPublicIpOnLaunch: true,
      privateDnsNameOptionsOnLaunch: {
        EnableResourceNameDnsAAAARecord: true,
        EnableResourceNameDnsARecord: true,
        HostnameType: "resource-name",
      },
      ipv6CidrBlock: Fn.select(
        0,
        Fn.cidr(Fn.select(0, vpc.attrIpv6CidrBlocks), 4, "64")
      ),
    });
    publicSubnetA.addDependsOn(ipv6Cidr);

    const publicSubnetB = new aws_ec2.CfnSubnet(this, "PubSubB", {
      vpcId: vpc.attrVpcId,
      cidrBlock: Fn.select(1, Fn.cidr(vpc.attrCidrBlock, 8, "8")),
      availabilityZone: Fn.select(1, this.availabilityZones),
      assignIpv6AddressOnCreation: true,
      mapPublicIpOnLaunch: true,
      privateDnsNameOptionsOnLaunch: {
        EnableResourceNameDnsAAAARecord: true,
        EnableResourceNameDnsARecord: true,
        HostnameType: "resource-name",
      },
      ipv6CidrBlock: Fn.select(
        1,
        Fn.cidr(Fn.select(0, vpc.attrIpv6CidrBlocks), 4, "64")
      ),
    });
    publicSubnetB.addDependsOn(ipv6Cidr);

    const privateSubnetA = new aws_ec2.CfnSubnet(this, "PriSubA", {
      vpcId: vpc.attrVpcId,
      availabilityZone: Fn.select(0, this.availabilityZones),
      assignIpv6AddressOnCreation: true,
      privateDnsNameOptionsOnLaunch: {
        EnableResourceNameDnsAAAARecord: true,
        HostnameType: "resource-name",
      },
      ipv6CidrBlock: Fn.select(
        2,
        Fn.cidr(Fn.select(0, vpc.attrIpv6CidrBlocks), 4, "64")
      ),
      ipv6Native: true,
      enableDns64: true,
    });
    privateSubnetA.addDependsOn(ipv6Cidr);

    const privateSubnetB = new aws_ec2.CfnSubnet(this, "PriSubB", {
      vpcId: vpc.attrVpcId,
      availabilityZone: Fn.select(1, this.availabilityZones),
      assignIpv6AddressOnCreation: true,
      privateDnsNameOptionsOnLaunch: {
        EnableResourceNameDnsAAAARecord: true,
        HostnameType: "resource-name",
      },
      ipv6CidrBlock: Fn.select(
        3,
        Fn.cidr(Fn.select(0, vpc.attrIpv6CidrBlocks), 4, "64")
      ),
      ipv6Native: true,
      enableDns64: true,
    });
    privateSubnetB.addDependsOn(ipv6Cidr);

    const igw = new aws_ec2.CfnInternetGateway(this, "IGW");
    new aws_ec2.CfnVPCGatewayAttachment(this, "IGWAttachment", {
      vpcId: vpc.attrVpcId,
      internetGatewayId: igw.attrInternetGatewayId,
    });
    const eoigw = new aws_ec2.CfnEgressOnlyInternetGateway(this, "EOIGW", {
      vpcId: vpc.attrVpcId,
    });

    const pubRoutTable = new aws_ec2.CfnRouteTable(this, "PublicRouteTable", {
      vpcId: vpc.attrVpcId,
    });

    const priRoutTable = new aws_ec2.CfnRouteTable(this, "PrivateRouteTable", {
      vpcId: vpc.attrVpcId,
    });

    const nat = new aws_ec2.CfnNatGateway(this, "NAT", {
      allocationId: new aws_ec2.CfnEIP(this, "NatIp").attrAllocationId,
      subnetId: publicSubnetA.attrSubnetId,
    });

    const priInternetRoute6 = new aws_ec2.CfnRoute(
      this,
      "PrivateInternetRoute6",
      {
        routeTableId: priRoutTable.attrRouteTableId,
        destinationIpv6CidrBlock: "::/0",
        egressOnlyInternetGatewayId: eoigw.attrId,
      }
    );

    const priRouteNat64 = new aws_ec2.CfnRoute(this, "PrivateRouteNat64", {
      routeTableId: priRoutTable.attrRouteTableId,
      destinationIpv6CidrBlock: "64:ff9b::/96",
      natGatewayId: nat.attrNatGatewayId,
    });

    const pubInternetRoute = new aws_ec2.CfnRoute(this, "PublicInternetRoute", {
      routeTableId: pubRoutTable.attrRouteTableId,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: igw.attrInternetGatewayId,
    });

    const pubInternetRoute6 = new aws_ec2.CfnRoute(
      this,
      "PublicInternetRoute6",
      {
        routeTableId: pubRoutTable.attrRouteTableId,
        destinationIpv6CidrBlock: "::/0",
        gatewayId: igw.attrInternetGatewayId,
      }
    );

    new aws_ec2.CfnSubnetRouteTableAssociation(this, "PubARouteAss", {
      routeTableId: pubRoutTable.attrRouteTableId,
      subnetId: publicSubnetA.attrSubnetId,
    });

    new aws_ec2.CfnSubnetRouteTableAssociation(this, "PubBRouteAss", {
      routeTableId: pubRoutTable.attrRouteTableId,
      subnetId: publicSubnetB.attrSubnetId,
    });

    new aws_ec2.CfnSubnetRouteTableAssociation(this, "PriARouteAss", {
      routeTableId: priRoutTable.attrRouteTableId,
      subnetId: privateSubnetA.attrSubnetId,
    });

    new aws_ec2.CfnSubnetRouteTableAssociation(this, "PriBRouteAss", {
      routeTableId: priRoutTable.attrRouteTableId,
      subnetId: privateSubnetB.attrSubnetId,
    });

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
              virtualName: 'ephemeral0'
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
