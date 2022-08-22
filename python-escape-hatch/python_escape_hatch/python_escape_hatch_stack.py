from aws_cdk import (
    RemovalPolicy,
    Stack,
    aws_s3,
    aws_lambda,
)
from constructs import Construct


class PythonEscapeHatchStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        bucket = aws_s3.Bucket(self, "PythonEscapeHatchBucket",
                               versioned=True,
                               removal_policy=RemovalPolicy.DESTROY,
                               auto_delete_objects=True,
                               )

        self.node.find_child("Custom::S3AutoDeleteObjectsCustomResourceProvider").node.find_child(
            "Handler").add_override('Properties.Runtime', aws_lambda.Runtime.NODEJS_16_X)
