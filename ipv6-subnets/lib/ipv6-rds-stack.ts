import { aws_ec2, Stack, StackProps, Duration, Fn } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Ttl } from "pwed-cdk/lib/lib/ttl";

export interface Ipv6RdsStackProps extends StackProps {
  vpc: aws_ec2.CfnVPC;
  publicSubnetA: aws_ec2.CfnSubnet;
  publicSubnetB: aws_ec2.CfnSubnet;
  privateSubnetA: aws_ec2.CfnSubnet;
  privateSubnetB: aws_ec2.CfnSubnet;
}

export class Ipv6RdsStack extends Stack {
  constructor(scope: Construct, id: string, props: Ipv6RdsStackProps) {
    super(scope, id, props);

    // Tear the stack down after 1 hour because I am cheap
    new Ttl(this, "Ttl", { ttl: Duration.hours(1) });

    const vpc = props.vpc;
    const publicSubnetA = props.publicSubnetA;
    const publicSubnetB = props.publicSubnetB;
    const privateSubnetA = props.privateSubnetA;
    const privateSubnetB = props.privateSubnetB;

    const securityGroupRds = new aws_ec2.CfnSecurityGroup(
      this,
      "SecurityGroup",
      {
        vpcId: vpc.attrVpcId,
        groupDescription: "",
        securityGroupIngress: [
          {
            cidrIpv6: Fn.select(0, vpc.attrIpv6CidrBlocks),
            fromPort: 3306,
            toPort: 3306,
            ipProtocol: "tcp",
          },
        ],
      }
    );
  }
}
