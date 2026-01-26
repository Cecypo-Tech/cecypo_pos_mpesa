app_name = "cecypo_pos_mpesa"
app_title = "Cecypo POS Mpesa"
app_publisher = "Cecypo.Tech"
app_description = "POS Mpesa Quick Pay integration for ERPNext"
app_email = "support@cecypo.tech"
app_license = "agpl-3.0"
required_apps = ["frappe_mpsa_payments"]

# Includes in <head>
# ------------------

# include js in page
page_js = {"point-of-sale": "public/js/point_of_sale_mpesa.js"}

# include js in doctype views
doctype_js = {
    "POS Invoice": "public/js/pos_invoice_mpesa_quick_pay.js",
}

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#     "*": {
#         "on_update": "method",
#         "on_cancel": "method",
#         "on_trash": "method"
#     }
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
#     "all": [
#         "cecypo_pos_mpesa.tasks.all"
#     ],
#     "daily": [
#         "cecypo_pos_mpesa.tasks.daily"
#     ],
# }

# Testing
# -------

# before_tests = "cecypo_pos_mpesa.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
#     "frappe.desk.doctype.event.event.get_events": "cecypo_pos_mpesa.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
#     "Task": "cecypo_pos_mpesa.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["cecypo_pos_mpesa.utils.before_request"]
# after_request = ["cecypo_pos_mpesa.utils.after_request"]

# Job Events
# ----------
# before_job = ["cecypo_pos_mpesa.utils.before_job"]
# after_job = ["cecypo_pos_mpesa.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
#     {
#         "doctype": "{doctype_1}",
#         "filter_by": "{filter_by}",
#         "redact_fields": ["{field_1}", "{field_2}"],
#         "partial": 1,
#     },
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
#     "cecypo_pos_mpesa.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
#     "Logging DocType Name": 30  # days to retain logs
# }
