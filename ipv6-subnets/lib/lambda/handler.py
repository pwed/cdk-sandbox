import boto3
import os

targetGroupArn = os.getenv('TARGET_GROUP_ARN')
ec2 = boto3.resource('ec2')
elasticLoadBalancing = boto3.client('elbv2')
autoscaling = boto3.client('autoscaling')


def addInstance(id):
    elasticLoadBalancing.register_targets(
        TargetGroupArn=targetGroupArn,
        Targets=[{'Id': id}]
    )


def removeInstances(ids):
    targets = []
    for id in ids:
        targets.append({'Id': id})
    elasticLoadBalancing.deregister_targets(
        TargetGroupArn=targetGroupArn,
        Targets=targets
    )


def handler(event, context):
    if event["detail-type"] == "EC2 Instance Launch Successful":
        instanceId = event["detail"]["EC2InstanceId"]
        instance = ec2.Instance(instanceId)
        instance.load()
        addInstance(instance.ipv6_address)
    autoscaling_instances = autoscaling.describe_auto_scaling_groups(
        AutoScalingGroupNames=[event["detail"]["AutoScalingGroupName"]]
    )["AutoScalingGroups"][0]["Instances"]
    targets = elasticLoadBalancing.describe_target_health(
        TargetGroupArn=targetGroupArn
    )["TargetHealthDescriptions"]
    staleTargets = []
    autoscalingTargets = []
    for autoscaling_instance in autoscaling_instances:
        instance = ec2.Instance(autoscaling_instance["InstanceId"])
        instance.load()
        if instance.state['Code'] in [0, 16]:
            autoscalingTargets.append(instance.ipv6_address)
    for target in targets:
        if target["Target"]["Id"] not in autoscalingTargets:
            staleTargets.append(target["Target"]["Id"])
    removeInstances(staleTargets)
    return
