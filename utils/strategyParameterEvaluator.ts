// utils/strategyParameterEvaluator.ts
// Utility to safely evaluate strategy parameters that may contain expressions

export interface StrategyContext {
  fundConfig?: {
    maxPosition?: number;
    initialDate?: string;
    initialPosition?: number;
    riskLevel?: 'low' | 'medium' | 'high';
    category?: string;
    [key: string]: any;
  };
  userConfig?: {
    globalMaxPosition?: number;
    riskPreference?: 'conservative' | 'balanced' | 'aggressive';
    [key: string]: any;
  };
  [key: string]: any; // Allow additional properties
}

/**
 * Safely evaluates a parameter value that might be an expression
 * Supports expressions like: '${fundConfig.maxPosition || 100000}'
 */
export function evaluateStrategyParameter(paramValue: any, ctx: StrategyContext): any {
  if (typeof paramValue !== 'string') {
    return paramValue;
  }

  // Check if this is an expression in the format ${expression}
  const expressionMatch = paramValue.match(/^\$\{(.+)\}$/);
  if (!expressionMatch) {
    return paramValue;
  }

  const expression = expressionMatch[1].trim();

  // Evaluate the expression safely by substituting values from context
  try {
    // Replace context references with actual values
    let evaluatedExpression = expression;

    // Handle fundConfig references
    if (ctx.fundConfig) {
      for (const [key, value] of Object.entries(ctx.fundConfig)) {
        const placeholder = `fundConfig.${key}`;
        if (evaluatedExpression.includes(placeholder)) {
          if (typeof value === 'string') {
            evaluatedExpression = evaluatedExpression.replace(
              new RegExp(placeholder, 'g'),
              JSON.stringify(value)
            );
          } else {
            evaluatedExpression = evaluatedExpression.replace(
              new RegExp(placeholder, 'g'),
              String(value)
            );
          }
        }
      }
    }

    // Handle userConfig references
    if (ctx.userConfig) {
      for (const [key, value] of Object.entries(ctx.userConfig)) {
        const placeholder = `userConfig.${key}`;
        if (evaluatedExpression.includes(placeholder)) {
          if (typeof value === 'string') {
            evaluatedExpression = evaluatedExpression.replace(
              new RegExp(placeholder, 'g'),
              JSON.stringify(value)
            );
          } else {
            evaluatedExpression = evaluatedExpression.replace(
              new RegExp(placeholder, 'g'),
              String(value)
            );
          }
        }
      }
    }

    // Handle the '||' operator for defaults by simulating it
    // This is a simple replacement, for more complex logic we'd need a proper parser
    if (evaluatedExpression.includes('||')) {
      const parts = evaluatedExpression.split('||').map(part => part.trim());

      // Try to evaluate the first part
      try {
        // Use a safe evaluation - we'll implement a simple numeric/string evaluation
        // For security, only allow simple operations on numbers and strings
        const firstPartResult = safeEvaluate(parts[0].trim());

        // If the first part is null, undefined, or NaN, use the second part
        if (firstPartResult != null && !isNaN(firstPartResult as number)) {
          return firstPartResult;
        } else {
          // Try the second part
          return safeEvaluate(parts[1].trim());
        }
      } catch {
        // If evaluation fails, try the second part as a fallback
        return safeEvaluate(parts[1].trim());
      }
    } else {
      // Direct evaluation of the expression
      return safeEvaluate(evaluatedExpression);
    }
  } catch (error) {
    console.warn(`Failed to evaluate strategy parameter expression: ${expression}. Using original value.`, error);
    return paramValue;
  }
}

/**
 * Safely evaluate a simple expression
 * Only supports basic arithmetic and values from context
 */
function safeEvaluate(expression: string): any {
  // Remove any potentially dangerous characters
  const sanitized = expression.trim();

  // Check if it's a simple number
  if (/^[0-9+\-*/.() ]+$/.test(sanitized)) {
    // Use Function constructor instead of eval for slightly better security
    // Still risky, but we limit the input to numbers and operators
    try {
      // For security, only allow arithmetic operations on numbers
      return new Function(`return (${sanitized})`)();
    } catch {
      throw new Error(`Invalid expression: ${sanitized}`);
    }
  }

  // If it's a string literal surrounded by quotes
  if ((sanitized.startsWith('"') && sanitized.endsWith('"')) ||
      (sanitized.startsWith("'") && sanitized.endsWith("'"))) {
    return sanitized.slice(1, -1); // Remove quotes
  }

  // If it's a boolean
  if (sanitized === 'true') return true;
  if (sanitized === 'false') return false;

  // If it's null or undefined
  if (sanitized === 'null') return null;
  if (sanitized === 'undefined') return undefined;

  // If it looks like a number but wasn't caught by the regex
  const num = Number(sanitized);
  if (!isNaN(num)) {
    return num;
  }

  throw new Error(`Unsupported expression format: ${sanitized}`);
}

/**
 * Evaluates all parameters in a strategy config object
 */
export function evaluateStrategyParams(
  params: Record<string, any>,
  ctx: StrategyContext
): Record<string, any> {
  const evaluatedParams: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    evaluatedParams[key] = evaluateStrategyParameter(value, ctx);
  }

  return evaluatedParams;
}