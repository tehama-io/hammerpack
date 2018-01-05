import * as ts from "typescript";

export class TypescriptCancellationToken implements ts.CancellationToken {

    static cancellationError: Error = new Error("Operation cancelled.");

    isCanceled: boolean = false;

    isCancellationRequested(): boolean {
        return this.isCanceled;
    }

    throwIfCancellationRequested(): void {
        throw new ts.OperationCanceledException();
    }

}
