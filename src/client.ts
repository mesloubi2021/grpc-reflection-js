import {ChannelCredentials, Metadata, ServiceError} from '@grpc/grpc-js';
import {getDescriptorRootFromDescriptorSet} from './descriptor';
import * as services from './reflection_grpc_pb';
import {
  ServerReflectionRequest,
  ServerReflectionResponse,
} from './reflection_pb';
import {Root} from '@postman/protobufjs';
import {
  FileDescriptorSet,
  IFileDescriptorProto,
  FileDescriptorProto,
} from '@postman/protobufjs/ext/descriptor';
import set from 'lodash.set';

export class Client {
  metadata: Metadata;
  grpcClient: services.IServerReflectionClient;
  constructor(
    url: string,
    credentials: ChannelCredentials,
    options?: object,
    metadata?: Metadata
  ) {
    this.metadata = metadata || new Metadata();
    this.grpcClient = new services.ServerReflectionClient(
      url,
      credentials,
      options
    );
  }

  listServices(): Promise<string[] | void[]> {
    return new Promise((resolve, reject) => {
      function dataCallback(response: ServerReflectionResponse) {
        if (response.hasListServicesResponse()) {
          const services = response
            .getListServicesResponse()
            ?.getServiceList()
            .map(svc => {
              return svc.getName();
            });
          resolve(services);
        } else {
          reject(Error());
        }
      }

      function errorCallback(e: ServiceError) {
        reject(e);
      }

      const request = new ServerReflectionRequest();
      request.setListServices('*');

      const grpcCall = this.grpcClient.serverReflectionInfo(this.metadata);
      grpcCall.on('data', dataCallback);
      grpcCall.on('error', errorCallback);
      grpcCall.write(request);
      grpcCall.end();
    });
  }

  fileContainingSymbol(symbol: string): Promise<Root> {
    return new Promise((resolve, reject) => {
      this.getFileContainingSymbol(symbol)
        .then(val => resolve(this.resolveFileDescriptorSet(val)))
        .catch(err => reject(err));
    });
  }

  fileByFilename(filename: string): Promise<Root> {
    return new Promise((resolve, reject) => {
      this.getFileByFilename(filename)
        .then(val => resolve(this.resolveFileDescriptorSet(val)))
        .catch(err => reject(err));
    });
  }

  private async resolveFileDescriptorSet(
    fileDescriptorProtoBytes: Array<Uint8Array | string> | undefined
  ): Promise<Root> {
    const fileDescriptorSet = FileDescriptorSet.create();
    const fileDescriptorProtos = await this.resolveDescriptorRecursive(
      fileDescriptorProtoBytes as Array<Uint8Array | string>
    );
    set(fileDescriptorSet, 'file', Array.from(fileDescriptorProtos.values()));
    return getDescriptorRootFromDescriptorSet(fileDescriptorSet);
  }

  private async resolveDescriptorRecursive(
    fileDescriptorProtoBytes: Array<Uint8Array | string>
  ): Promise<Map<string, IFileDescriptorProto>> {
    let fileDescriptorProtos: Map<string, IFileDescriptorProto> = new Map();
    for (const descriptorByte of fileDescriptorProtoBytes) {
      const fileDescriptorProto = FileDescriptorProto.decode(
        descriptorByte as Uint8Array
      ) as IFileDescriptorProto;
      if (fileDescriptorProto.dependency) {
        const dependencies = fileDescriptorProto.dependency as Array<string>;
        for (const dep of dependencies) {
          const depProtoBytes = await this.getFileByFilename(dep);
          const protoDependencies = await this.resolveDescriptorRecursive(
            depProtoBytes as Array<Uint8Array | string>
          );
          fileDescriptorProtos = new Map([
            ...fileDescriptorProtos,
            ...protoDependencies,
          ]);
        }
      }
      if (!fileDescriptorProtos.has(fileDescriptorProto.name as string)) {
        fileDescriptorProtos.set(
          fileDescriptorProto.name as string,
          fileDescriptorProto
        );
      }
    }
    return fileDescriptorProtos;
  }

  private getFileContainingSymbol(
    symbol: string
  ): Promise<Array<Uint8Array | string> | undefined> {
    return new Promise((resolve, reject) => {
      function dataCallback(response: ServerReflectionResponse) {
        if (response.hasFileDescriptorResponse()) {
          resolve(
            response.getFileDescriptorResponse()?.getFileDescriptorProtoList()
          );
        } else {
          reject(Error());
        }
      }

      function errorCallback(e: ServiceError) {
        reject(e);
      }

      const request = new ServerReflectionRequest();
      request.setFileContainingSymbol(symbol);

      const grpcCall = this.grpcClient.serverReflectionInfo(this.metadata);
      grpcCall.on('data', dataCallback);
      grpcCall.on('error', errorCallback);
      grpcCall.write(request);
      grpcCall.end();
    });
  }

  private getFileByFilename(
    symbol: string
  ): Promise<Array<Uint8Array | string> | undefined> {
    return new Promise((resolve, reject) => {
      function dataCallback(response: ServerReflectionResponse) {
        if (response.hasFileDescriptorResponse()) {
          resolve(
            response.getFileDescriptorResponse()?.getFileDescriptorProtoList()
          );
        } else {
          reject(Error());
        }
      }

      function errorCallback(e: ServiceError) {
        reject(e);
      }

      const request = new ServerReflectionRequest();
      request.setFileByFilename(symbol);

      const grpcCall = this.grpcClient.serverReflectionInfo(this.metadata);
      grpcCall.on('data', dataCallback);
      grpcCall.on('error', errorCallback);
      grpcCall.write(request);
      grpcCall.end();
    });
  }
}
