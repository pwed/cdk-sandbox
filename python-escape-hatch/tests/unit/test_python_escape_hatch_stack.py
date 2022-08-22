import aws_cdk as core
import aws_cdk.assertions as assertions

from python_escape_hatch.python_escape_hatch_stack import PythonEscapeHatchStack

# example tests. To run these tests, uncomment this file along with the example
# resource in python_escape_hatch/python_escape_hatch_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = PythonEscapeHatchStack(app, "python-escape-hatch")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
