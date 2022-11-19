export declare type PrecompileIntlOptions = {
    literalTransform?: (value: string) => string;
};
export default function build(runtimeImportPath?: string): (api: object, options: PrecompileIntlOptions | null | undefined, dirname: string) => import("@babel/core").PluginObj<import("@babel/core").PluginPass>;
