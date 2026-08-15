export const ANALYTICS_EVENTS = {
  loginStarted: 'login_started',
  signedIn: 'signed_in',
  uploadStarted: 'upload_started',
  uploadCompleted: 'upload_completed',
  mappingCompleted: 'mapping_completed',
  transactionsSaved: 'transactions_saved',
  dashboardViewed: 'dashboard_viewed',
  proCheckoutStarted: 'pro_checkout_started',
  proActivated: 'pro_activated',
  proReportGenerated: 'pro_report_generated',
  proInsightsDegraded: 'pro_insights_degraded',
  accountDeleted: 'account_deleted',
} as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]
