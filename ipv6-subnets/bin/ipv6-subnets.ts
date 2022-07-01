#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Ipv6SubnetsStack } from '../lib/ipv6-subnets-stack';
import { Ipv6AutoscalingStack } from '../lib/ipv6-autoscaling-stack';
import { Ipv6RdsStack } from '../lib/ipv6-rds-stack';

const app = new cdk.App();
const Ipv6Subnets = new Ipv6SubnetsStack(app, 'Ipv6Subnets');

new Ipv6AutoscalingStack(app, 'Ipv6Autoscaling', {
  vpc: Ipv6Subnets.vpc,
  publicSubnetA: Ipv6Subnets.publicSubnetA,
  publicSubnetB: Ipv6Subnets.publicSubnetB,
  privateSubnetA: Ipv6Subnets.privateSubnetA,
  privateSubnetB: Ipv6Subnets.privateSubnetB,
})

new Ipv6RdsStack(app, 'Ipv6Rds', {
  vpc: Ipv6Subnets.vpc,
  publicSubnetA: Ipv6Subnets.publicSubnetA,
  publicSubnetB: Ipv6Subnets.publicSubnetB,
  privateSubnetA: Ipv6Subnets.privateSubnetA,
  privateSubnetB: Ipv6Subnets.privateSubnetB,
})