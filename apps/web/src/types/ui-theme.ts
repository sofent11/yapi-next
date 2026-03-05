export type UiDensity = 'comfortable' | 'compact';

export type UiBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export type UiThemePalette = {
  brand: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  neutral: {
    0: string;
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
};

export type UiThemeSpec = {
  density: UiDensity;
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  spacingUnit: number;
  breakpoints: Record<UiBreakpoint, number>;
  palette: UiThemePalette;
};
