// Quick Pay - Mpesa Client Script for POS Invoice
// For Phone type Mode of Payment (Mpesa) payments only

const POS_QUICK_PAY_MPESA_CONFIG = {
    auto_save_invoice: true,
    auto_submit_invoice: false  // POS usually needs manual review before submit
};

frappe.ui.form.on('POS Invoice', {
    refresh(frm) {
        const outstanding = flt(frm.doc.outstanding_amount || 0);
        const is_draft = frm.doc.docstatus === 0;
        const is_submitted = frm.doc.docstatus === 1;
        const not_cancelled = frm.doc.docstatus !== 2;

        // Show button if invoice has outstanding amount and is not cancelled
        if (not_cancelled && outstanding > 0 && (is_draft || is_submitted)) {
            frappe.call({
                method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
                args: {
                    action: 'check_mpesa_available',
                    company: frm.doc.company
                },
                callback(r) {
                    if (r.message && r.message.available) {
                        frm.add_custom_button(__('Quick Pay - Mpesa'), () => {
                            show_pos_mpesa_pay_dialog(frm);
                        }, __('Actions'));
                    }
                }
            });
        }
    }
});

function show_pos_mpesa_pay_dialog(frm) {
    const outstanding = flt(frm.doc.outstanding_amount || 0);

    if (outstanding <= 0) {
        frappe.msgprint(__('No outstanding amount to pay'));
        return;
    }

    const dialog = new frappe.ui.Dialog({
        title: __('Quick Pay - Mpesa'),
        size: 'large',
        fields: [
            { fieldtype: 'HTML', fieldname: 'payment_summary', options: get_pos_mpesa_summary_html(frm, outstanding) },
            { fieldtype: 'Section Break', label: __('Select Mpesa Payments') },
            { fieldtype: 'HTML', fieldname: 'mpesa_list' },
            { fieldtype: 'Section Break' },
            { fieldtype: 'HTML', fieldname: 'mpesa_totals' },
            { fieldtype: 'Section Break', fieldname: 'payment_section', label: __('Payment Options'), hidden: 1 },
            { fieldtype: 'HTML', fieldname: 'payment_options_html' }
        ],
        primary_action_label: __('Add Payments'),
        primary_action() {
            process_pos_mpesa_payments(frm, dialog, outstanding);
        },
        secondary_action_label: __('Request Payment'),
        secondary_action() {
            show_pos_request_payment_dialog(frm, dialog);
        }
    });

    dialog.selected_mpesa = [];
    dialog.outstanding = outstanding;
    dialog.currency = frm.doc.currency;
    dialog.company = frm.doc.company;
    dialog.auto_save = POS_QUICK_PAY_MPESA_CONFIG.auto_save_invoice;
    dialog.auto_submit = POS_QUICK_PAY_MPESA_CONFIG.auto_submit_invoice;
    dialog.search_term = '';
    dialog.mpesa_data = {count: 0, payments: []};

    dialog.$wrapper.find('.modal-dialog').css('max-width', '800px');
    dialog.show();
    inject_pos_mpesa_styles();

    // Load initial count
    dialog.fields_dict.mpesa_list.$wrapper.html(
        `<div class="text-center text-muted p-4"><i class="fa fa-spinner fa-spin"></i> ${__('Loading...')}</div>`
    );

    frappe.call({
        method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
        args: {
            action: 'get_mpesa_payments',
            company: frm.doc.company,
            search: ''
        },
        callback(r) {
            dialog.mpesa_data = r.message || {count: 0, payments: []};
            render_pos_mpesa_list(dialog);
            update_pos_mpesa_totals(dialog);
        }
    });
}

function get_pos_mpesa_summary_html(frm, outstanding) {
    const paid = flt(frm.doc.paid_amount || 0);
    const total = flt(frm.doc.grand_total || 0);
    const percent = total > 0 ? Math.round((paid / total) * 100) : 0;

    return `
        <div class="mpesa-pay-header">
            <div class="mpesa-header-icon">
                <i class="fa fa-mobile"></i>
            </div>
            <div class="mpesa-header-info">
                <div class="mpesa-row">
                    <span>${__('Customer')}</span>
                    <strong>${frm.doc.customer_name || frm.doc.customer}</strong>
                </div>
                <div class="mpesa-row">
                    <span>${__('Grand Total')}</span>
                    <strong>${format_currency(total, frm.doc.currency)}</strong>
                </div>
                <div class="mpesa-row">
                    <span>${__('Already Paid')}</span>
                    <strong class="text-success">${format_currency(paid, frm.doc.currency)} <small>(${percent}%)</small></strong>
                </div>
                <div class="mpesa-row mpesa-outstanding">
                    <span>${__('Outstanding')}</span>
                    <strong>${format_currency(outstanding, frm.doc.currency)}</strong>
                </div>
            </div>
        </div>
    `;
}

function render_pos_mpesa_list(dialog) {
    const wrapper = dialog.fields_dict.mpesa_list.$wrapper;
    const data = dialog.mpesa_data || {};
    const count = data.count || 0;
    const payments = data.payments || [];

    if (count === 0) {
        wrapper.html(`
            <div class="mpesa-empty-state">
                <i class="fa fa-inbox fa-3x text-muted"></i>
                <p class="mt-3">${__('No pending Mpesa payments found')}</p>
                <small class="text-muted">${__('Mpesa payments will appear here once received')}</small>
            </div>
        `);
        return;
    }

    let html = `
        <div class="mpesa-search-section">
            <div class="mpesa-search-box">
                <i class="fa fa-search mpesa-search-icon"></i>
                <input type="text" class="form-control" id="mpesa-search"
                       placeholder="${__('Search name, phone, transaction ID, reference (min 3 chars)...')}"
                       value="${dialog.search_term || ''}">
            </div>
            <div class="mpesa-count-badge">
                <i class="fa fa-mobile"></i>
                <span><strong>${count}</strong> ${__('pending')}</span>
            </div>
        </div>
        <div class="mpesa-payments-list" id="mpesa-payments-list">
    `;

    if (payments.length === 0 && dialog.search_term && dialog.search_term.length >= 3) {
        html += `
            <div class="mpesa-no-results">
                <i class="fa fa-search text-muted"></i>
                <p>${__('No payments match your search')}</p>
            </div>
        `;
    } else if (payments.length === 0) {
        html += `
            <div class="mpesa-search-prompt">
                <i class="fa fa-hand-o-up text-muted"></i>
                <p>${__('Enter a search term above to find payments')}</p>
            </div>
        `;
    } else {
        html += `
            <div class="mpesa-results-header">
                <label class="mpesa-checkbox-label mpesa-select-all-label">
                    <input type="checkbox" id="mpesa-select-all">
                    <span>${__('Select All')} (${payments.length} ${__('results')})</span>
                </label>
            </div>
        `;

        const today = frappe.datetime.get_today();

        for (const p of payments) {
            const amount = flt(p.transamount || 0);
            const phone = p.msisdn || '';
            const name = p.full_name || '';
            const ref = p.billrefnumber || '';
            const trans_id = p.transid || p.name;
            const posting_date = p.posting_date || p.creation || '';

            // Calculate age styling
            const age_style = get_pos_age_style(posting_date, today);
            const age_days = get_pos_age_days(posting_date, today);
            const age_label = get_pos_age_label(age_days);

            const is_selected = dialog.selected_mpesa.some(x => x.name === p.name);
            const is_overpayment = amount > dialog.outstanding;
            const is_exact_match = Math.abs(amount - dialog.outstanding) < 0.01;

            let item_class = is_selected ? 'selected' : '';
            if (is_exact_match) {
                item_class += ' exact-match';
            } else if (is_overpayment) {
                item_class += ' overpayment-warning';
            }

            html += `
                <div class="mpesa-payment-item ${item_class}" data-name="${p.name}" data-amount="${amount}">
                    <div class="mpesa-item-checkbox">
                        <input type="checkbox" class="mpesa-item-check" data-name="${p.name}" data-amount="${amount}" ${is_selected ? 'checked' : ''}>
                    </div>
                    <div class="mpesa-item-info">
                        <div class="mpesa-item-primary">
                            <span class="mpesa-sender-name">${name || __('Unknown')}</span>
                            <span class="mpesa-amount ${is_overpayment && !is_exact_match ? 'text-warning' : ''}">${format_currency(amount, dialog.currency)}${is_exact_match ? '<span class="mpesa-exact-badge">' + __('EXACT') + '</span>' : ''}${is_overpayment && !is_exact_match ? ' <i class="fa fa-exclamation-triangle" title="' + __('Exceeds outstanding amount') + '"></i>' : ''}</span>
                        </div>
                        <div class="mpesa-item-secondary">
                            <span class="mpesa-phone"><i class="fa fa-phone"></i> ${phone}</span>
                            ${ref ? `<span class="mpesa-ref"><i class="fa fa-hashtag"></i> ${ref}</span>` : ''}
                            <span class="mpesa-trans-id"><i class="fa fa-exchange"></i> ${trans_id}</span>
                        </div>
                    </div>
                    <div class="mpesa-age-indicator" style="${age_style}" title="${posting_date}">
                        ${age_label}
                    </div>
                </div>
            `;
        }
    }

    html += '</div>';
    wrapper.html(html);

    // Search handler with debounce
    let search_timeout;
    wrapper.find('#mpesa-search').on('input', function() {
        const search = $(this).val().trim();
        clearTimeout(search_timeout);

        if (search.length >= 3 || search.length === 0) {
            search_timeout = setTimeout(() => {
                dialog.search_term = search;
                load_pos_mpesa_payments(dialog, search);
            }, 300);
        }
    });

    // Select all handler
    wrapper.find('#mpesa-select-all').on('change', function() {
        const checked = $(this).is(':checked');
        wrapper.find('.mpesa-item-check').prop('checked', checked).trigger('change');
    });

    // Individual item handler
    wrapper.find('.mpesa-item-check').on('change', function() {
        const name = $(this).data('name');
        const amount = flt($(this).data('amount'));
        const checked = $(this).is(':checked');

        if (checked) {
            if (!dialog.selected_mpesa.find(x => x.name === name)) {
                dialog.selected_mpesa.push({ name, amount });
            }
        } else {
            dialog.selected_mpesa = dialog.selected_mpesa.filter(x => x.name !== name);
        }

        $(this).closest('.mpesa-payment-item').toggleClass('selected', checked);
        update_pos_mpesa_totals(dialog);
    });
}

function get_pos_age_days(posting_date, today) {
    if (!posting_date) return 0;
    const post = frappe.datetime.str_to_obj(posting_date);
    const now = frappe.datetime.str_to_obj(today);
    const diff = Math.floor((now - post) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
}

function get_pos_age_style(posting_date, today) {
    const days = get_pos_age_days(posting_date, today);

    let bg_color, text_color;

    if (days === 0) {
        bg_color = 'rgba(34, 197, 94, 0.15)';
        text_color = '#16a34a';
    } else if (days <= 3) {
        bg_color = 'rgba(234, 179, 8, 0.15)';
        text_color = '#ca8a04';
    } else if (days <= 7) {
        bg_color = 'rgba(249, 115, 22, 0.15)';
        text_color = '#ea580c';
    } else if (days <= 14) {
        bg_color = 'rgba(239, 68, 68, 0.15)';
        text_color = '#dc2626';
    } else {
        bg_color = 'rgba(185, 28, 28, 0.2)';
        text_color = '#b91c1c';
    }

    return `background: ${bg_color}; color: ${text_color};`;
}

function get_pos_age_label(days) {
    if (days === 0) return __('Today');
    if (days === 1) return __('1 day');
    if (days < 7) return days + ' ' + __('days');
    if (days < 14) return __('1 week+');
    if (days < 30) return Math.floor(days / 7) + ' ' + __('weeks');
    return Math.floor(days / 30) + ' ' + __('month(s)');
}

function load_pos_mpesa_payments(dialog, search) {
    const wrapper = dialog.fields_dict.mpesa_list.$wrapper;
    wrapper.find('#mpesa-payments-list').html(
        `<div class="text-center text-muted p-3"><i class="fa fa-spinner fa-spin"></i> ${__('Searching...')}</div>`
    );

    frappe.call({
        method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
        args: {
            action: 'get_mpesa_payments',
            company: dialog.company,
            search: search || ''
        },
        callback(r) {
            dialog.mpesa_data = r.message || {count: 0, payments: []};
            render_pos_mpesa_list(dialog);
            update_pos_mpesa_totals(dialog);
        }
    });
}

function update_pos_mpesa_totals(dialog) {
    const wrapper = dialog.fields_dict.mpesa_totals.$wrapper;
    const total_selected = dialog.selected_mpesa.reduce((sum, p) => sum + flt(p.amount), 0);
    const remaining = dialog.outstanding - total_selected;
    const fully_paid = remaining <= 0;
    const overpayment = total_selected > dialog.outstanding;
    const excess_amount = overpayment ? total_selected - dialog.outstanding : 0;

    // Show/hide payment options
    if (POS_QUICK_PAY_MPESA_CONFIG.auto_save_invoice && total_selected > 0) {
        dialog.set_df_property('payment_section', 'hidden', 0);
        render_pos_payment_options(dialog, fully_paid);
    } else {
        dialog.set_df_property('payment_section', 'hidden', 1);
    }

    wrapper.html(`
        <div class="mpesa-totals-bar ${overpayment ? 'mpesa-overpayment' : ''}">
            <div class="mpesa-total-item">
                <span>${__('Selected')}</span>
                <strong>${dialog.selected_mpesa.length} ${__('payment(s)')}</strong>
            </div>
            <div class="mpesa-total-item">
                <span>${__('Total Amount')}</span>
                <strong class="${total_selected >= dialog.outstanding ? 'text-success' : ''}">${format_currency(total_selected, dialog.currency)}</strong>
            </div>
            <div class="mpesa-total-item">
                <span>${__('Remaining')}</span>
                <strong class="${remaining > 0 ? 'text-warning' : 'text-success'}">${format_currency(Math.max(0, remaining), dialog.currency)}</strong>
            </div>
            ${overpayment ? `
                <div class="mpesa-total-item mpesa-excess-warning">
                    <span>${__('Excess Amount')}</span>
                    <strong class="text-warning">${format_currency(excess_amount, dialog.currency)}</strong>
                </div>
                <div class="mpesa-total-item mpesa-overpay-note">
                    <span class="text-warning"><i class="fa fa-exclamation-triangle"></i> ${__('Total exceeds outstanding. Change will be recorded.')}</span>
                </div>
            ` : ''}
        </div>
    `);
}

function render_pos_payment_options(dialog, fully_paid) {
    const wrapper = dialog.fields_dict.payment_options_html.$wrapper;

    wrapper.html(`
        <div class="mpesa-invoice-options">
            <div class="mpesa-invoice-check">
                <label class="mpesa-checkbox-label">
                    <input type="checkbox" id="mpesa-auto-save" ${dialog.auto_save ? 'checked' : ''}>
                    <span>${__('Auto-save invoice after adding payments')}</span>
                </label>
            </div>
            ${fully_paid ? `
                <div class="mpesa-invoice-check">
                    <label class="mpesa-checkbox-label">
                        <input type="checkbox" id="mpesa-auto-submit" ${dialog.auto_submit ? 'checked' : ''}>
                        <span>${__('Auto-submit invoice (if fully paid)')}</span>
                    </label>
                </div>
            ` : ''}
        </div>
    `);

    // Update dialog properties when checkboxes change
    wrapper.find('#mpesa-auto-save').on('change', function() {
        dialog.auto_save = $(this).is(':checked');
    });

    wrapper.find('#mpesa-auto-submit').on('change', function() {
        dialog.auto_submit = $(this).is(':checked');
    });
}

function process_pos_mpesa_payments(frm, dialog, outstanding) {
    if (!dialog.selected_mpesa.length) {
        frappe.msgprint(__('Please select at least one Mpesa payment'));
        return;
    }

    const mpesa_names = dialog.selected_mpesa.map(p => p.name).join(',');

    frappe.call({
        method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
        args: {
            action: 'process_mpesa',
            pos_invoice: frm.doc.name,
            customer: frm.doc.customer,
            mpesa_payments: mpesa_names,
            outstanding_amount: outstanding,
            auto_save: dialog.auto_save ? 1 : 0,
            auto_submit: dialog.auto_submit ? 1 : 0
        },
        freeze: true,
        freeze_message: __('Processing Mpesa Payments...'),
        callback(r) {
            if (r.message && r.message.success) {
                dialog.hide();

                let msg = `<p><strong>${__('Mpesa Payments Added Successfully')}</strong></p>`;

                if (r.message.payments_added && r.message.payments_added.length) {
                    msg += '<ul>';
                    for (const p of r.message.payments_added) {
                        msg += `<li>${p.mode_of_payment}: ${format_currency(p.amount, frm.doc.currency)} - ${p.reference}</li>`;
                    }
                    msg += '</ul>';
                }

                if (r.message.mpesa_payments && r.message.mpesa_payments.length) {
                    msg += `<p class="text-muted"><small>${__('Mpesa entries processed')}: ${r.message.mpesa_payments.map(m => m.name).join(', ')}</small></p>`;
                }

                if (r.message.saved) {
                    msg += `<p class="text-success"><i class="fa fa-check"></i> ${__('Invoice saved')}</p>`;
                }

                if (r.message.submitted) {
                    msg += `<p class="text-success"><i class="fa fa-check"></i> ${__('Invoice submitted')}</p>`;
                }

                if (r.message.error) {
                    msg += `<p class="text-danger"><i class="fa fa-exclamation-triangle"></i> ${r.message.error}</p>`;
                }

                frappe.msgprint({ title: __('Payment Successful'), message: msg, indicator: 'green' });
                frm.reload_doc();
            }
        },
        error(r) {
            frappe.msgprint({
                title: __('Error'),
                message: r.message || __('Failed to process Mpesa payments'),
                indicator: 'red'
            });
        }
    });
}

function show_pos_request_payment_dialog(frm, parent_dialog) {
    const outstanding = flt(frm.doc.outstanding_amount || 0);

    // Get customer phone from contact
    frappe.call({
        method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
        args: {
            action: 'get_customer_phone',
            customer: frm.doc.customer
        },
        callback(r) {
            const phone = r.message || '';

            const req_dialog = new frappe.ui.Dialog({
                title: __('Request Mpesa Payment'),
                fields: [
                    {
                        fieldtype: 'HTML',
                        fieldname: 'request_info',
                        options: `
                            <div class="mpesa-request-info">
                                <div class="mpesa-req-row">
                                    <span>${__('Customer')}</span>
                                    <strong>${frm.doc.customer_name || frm.doc.customer}</strong>
                                </div>
                                <div class="mpesa-req-row">
                                    <span>${__('Amount to Request')}</span>
                                    <strong class="text-success">${format_currency(outstanding, frm.doc.currency)}</strong>
                                </div>
                            </div>
                        `
                    },
                    {
                        fieldtype: 'Data',
                        fieldname: 'phone_number',
                        label: __('Phone Number'),
                        reqd: 1,
                        default: phone,
                        description: __('Enter phone number with or without country code (e.g., 0727870777 or 254727870777)')
                    }
                ],
                primary_action_label: __('Send Request'),
                primary_action(values) {
                    if (!values.phone_number) {
                        frappe.msgprint(__('Please enter a phone number'));
                        return;
                    }

                    frappe.call({
                        method: 'cecypo_pos_mpesa.api.pos_quick_pay_mpesa_process',
                        args: {
                            action: 'create_payment_request',
                            pos_invoice: frm.doc.name,
                            customer: frm.doc.customer,
                            phone_number: values.phone_number,
                            amount: outstanding
                        },
                        freeze: true,
                        freeze_message: __('Sending Payment Request...'),
                        callback(r) {
                            if (r.message && r.message.success) {
                                req_dialog.hide();

                                frappe.msgprint({
                                    title: __('Payment Request Sent'),
                                    message: `
                                        <p>${__('Payment request has been sent to')} <strong>${values.phone_number}</strong></p>
                                        <p><a href="/app/payment-request/${r.message.payment_request}" target="_blank" class="btn btn-sm btn-primary">
                                            <i class="fa fa-external-link"></i> ${r.message.payment_request}
                                        </a></p>
                                    `,
                                    indicator: 'green'
                                });

                                frm.reload_doc();
                            }
                        },
                        error(r) {
                            frappe.msgprint({
                                title: __('Error'),
                                message: r.message || __('Failed to create payment request'),
                                indicator: 'red'
                            });
                        }
                    });
                }
            });

            req_dialog.show();
        }
    });
}

function inject_pos_mpesa_styles() {
    if (document.getElementById('pos-mpesa-pay-styles')) return;

    $(`<style id="pos-mpesa-pay-styles">
        .mpesa-pay-header {
            background: linear-gradient(135deg, #00a650 0%, #007a3d 100%);
            border-radius: 10px;
            padding: 16px 20px;
            color: white;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .mpesa-header-icon { font-size: 2.5em; opacity: 0.9; }
        .mpesa-header-info { flex: 1; }
        .mpesa-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
        .mpesa-row:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.15); }
        .mpesa-row .text-success { color: #a3e635 !important; }
        .mpesa-outstanding { font-size: 1.15em; padding-top: 8px; }
        .mpesa-outstanding strong { color: #fbbf24; }

        /* Search section */
        .mpesa-search-section {
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 10px 14px;
            margin-bottom: 12px;
        }
        .mpesa-search-box {
            flex: 1;
            position: relative;
        }
        .mpesa-search-box input {
            padding-left: 32px;
            height: 36px;
            font-size: 13px;
            border-radius: 6px;
            width: 100%;
        }
        .mpesa-search-icon {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            font-size: 12px;
        }
        .mpesa-count-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(0, 166, 80, 0.1);
            border-radius: 6px;
            color: #00a650;
            font-size: 13px;
            white-space: nowrap;
        }
        .mpesa-count-badge i { font-size: 1.1em; }

        /* Results */
        .mpesa-payments-list {
            max-height: 280px;
            overflow-y: auto;
            border: 1px solid var(--border-color);
            border-radius: 8px;
        }
        .mpesa-results-header {
            padding: 8px 12px;
            background: var(--bg-color);
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .mpesa-select-all-label { font-weight: 500; font-size: 12px; }

        .mpesa-payment-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color);
            cursor: pointer;
            transition: background 0.15s;
        }
        .mpesa-payment-item:last-child { border-bottom: none; }
        .mpesa-payment-item:hover { background: var(--bg-color); }
        .mpesa-payment-item.selected { background: rgba(0, 166, 80, 0.08); }
        .mpesa-payment-item.exact-match { border-left: 3px solid #00a650; background: rgba(0, 166, 80, 0.05); }
        .mpesa-payment-item.exact-match .mpesa-amount { position: relative; }
        .mpesa-payment-item.exact-match .mpesa-exact-badge {
            display: inline-block;
            font-size: 9px;
            background: #00a650;
            color: white;
            padding: 1px 5px;
            border-radius: 3px;
            margin-left: 6px;
            vertical-align: middle;
        }
        .mpesa-payment-item.overpayment-warning { border-left: 3px solid var(--yellow-500); }
        .mpesa-payment-item.overpayment-warning.selected { background: rgba(234, 179, 8, 0.08); }

        .mpesa-item-checkbox { flex-shrink: 0; }
        .mpesa-item-checkbox input { width: 16px; height: 16px; accent-color: #00a650; }
        .mpesa-item-info { flex: 1; min-width: 0; }
        .mpesa-item-primary { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
        .mpesa-sender-name { font-weight: 600; font-size: 13px; }
        .mpesa-amount { font-weight: 600; color: #00a650; font-size: 13px; }
        .mpesa-amount.text-warning { color: #ca8a04; }
        .mpesa-amount i { margin-left: 4px; font-size: 11px; }
        .mpesa-item-secondary { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--text-muted); }
        .mpesa-item-secondary i { margin-right: 3px; }

        /* Age indicator */
        .mpesa-age-indicator {
            flex-shrink: 0;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            min-width: 60px;
            text-align: center;
        }

        /* Empty/prompt states */
        .mpesa-empty-state, .mpesa-no-results, .mpesa-search-prompt {
            text-align: center;
            padding: 30px 20px;
            color: var(--text-muted);
        }
        .mpesa-no-results, .mpesa-search-prompt { padding: 24px 20px; }
        .mpesa-no-results i, .mpesa-search-prompt i { font-size: 1.8em; margin-bottom: 8px; display: block; }
        .mpesa-empty-state i { font-size: 2.5em; margin-bottom: 10px; }

        /* Totals */
        .mpesa-totals-bar {
            display: flex;
            gap: 20px;
            padding: 12px 14px;
            background: var(--bg-color);
            border-radius: 8px;
            border: 1px solid var(--border-color);
            flex-wrap: wrap;
            align-items: center;
        }
        .mpesa-totals-bar.mpesa-overpayment { border-color: var(--yellow-500); background: rgba(234, 179, 8, 0.05); }
        .mpesa-total-item { display: flex; flex-direction: column; }
        .mpesa-total-item span { font-size: 10px; color: var(--text-muted); }
        .mpesa-total-item strong { font-size: 1.1em; }
        .mpesa-excess-warning { padding: 4px 10px; background: rgba(234, 179, 8, 0.1); border-radius: 4px; }
        .mpesa-overpay-note { width: 100%; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--yellow-500); font-size: 12px; }

        /* Checkbox */
        .mpesa-checkbox-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: normal; font-size: 12px; }
        .mpesa-checkbox-label input[type="checkbox"] { width: 14px; height: 14px; accent-color: #00a650; }
        .mpesa-checkbox-label input[type="checkbox"]:disabled { opacity: 0.7; }

        /* Invoice options */
        .mpesa-invoice-options {
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 6px 0;
        }
        .mpesa-invoice-check { display: flex; align-items: center; }

        /* Request payment dialog */
        .mpesa-request-info {
            background: linear-gradient(135deg, #00a650 0%, #007a3d 100%);
            border-radius: 8px;
            padding: 12px 16px;
            color: white;
            margin-bottom: 12px;
        }
        .mpesa-req-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
        }
        .mpesa-req-row:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.15); }
        .mpesa-req-row .text-success { color: #a3e635 !important; }
    </style>`).appendTo('head');
}
