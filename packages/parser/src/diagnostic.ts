export type DiagnosticSeverity = 'error' | 'warning';

export type Diagnostic = {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
};

export type DiagnosticCode =
  | 'missing_generator'
  | 'missing_generator_output'
  | 'duplicate_type'
  | 'duplicate_enum'
  | 'duplicate_type_field'
  | 'duplicate_enum_value'
  | 'duplicate_resource'
  | 'duplicate_action'
  | 'invalid_resource_name'
  | 'invalid_action_name'
  | 'missing_resource_path'
  | 'missing_action_path'
  | 'missing_action_method'
  | 'missing_action_response'
  | 'missing_action_params'
  | 'path_param_missing_field'
  | 'path_param_optionality_mismatch'
  | 'path_param_unused_field'
  | 'unknown_type'
  | 'body_not_allowed';
