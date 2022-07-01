import {
  aws_ec2,
  Fn,
  Stack,
  StackProps,
  Duration,
} from "aws-cdk-lib";
import { ttl } from "pwed-cdk";
import { Construct } from "constructs";

export class Ipv6SubnetsStack extends Stack {
  vpc: aws_ec2.CfnVPC;
  publicSubnetA: aws_ec2.CfnSubnet;
  publicSubnetB: aws_ec2.CfnSubnet;
  privateSubnetA: aws_ec2.CfnSubnet;
  privateSubnetB: aws_ec2.CfnSubnet;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new ttl.Ttl(this, "Ttl", { ttl: Duration.hours(5) });

    this.vpc = new aws_ec2.CfnVPC(this, "Vpc", {
      cidrBlock: "10.0.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });
    const vpc = this.vpc;

    const ipv6Cidr = new aws_ec2.CfnVPCCidrBlock(this, "Ipv6Cidr", {
      vpcId: vpc.attrVpcId,
      amazonProvidedIpv6CidrBlock: true,
    });

    this.publicSubnetA = new aws_ec2.CfnSubnet(this, "PubSubA", {
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
    const publicSubnetA = this.publicSubnetA;
    publicSubnetA.addDependsOn(ipv6Cidr);

    this.publicSubnetB = new aws_ec2.CfnSubnet(this, "PubSubB", {
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
    const publicSubnetB = this.publicSubnetB;
    publicSubnetB.addDependsOn(ipv6Cidr);

    this.privateSubnetA = new aws_ec2.CfnSubnet(this, "PriSubA", {
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
    const privateSubnetA = this.privateSubnetA;
    privateSubnetA.addDependsOn(ipv6Cidr);

    this.privateSubnetB = new aws_ec2.CfnSubnet(this, "PriSubB", {
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
    const privateSubnetB = this.privateSubnetB;
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
  }
}
