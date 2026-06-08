/**
 * Copyright (c) 2021 WIZnet Co.,Ltd
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * ----------------------------------------------------------------------------------------------------
 * Includes
 * ----------------------------------------------------------------------------------------------------
 */
#include <stdio.h>
#include <string.h>

#include "port_common.h"

#include "ethchip_conf.h"
#include "ethchip_spi.h"

#include "mqtt_interface.h"
#include "MQTTClient.h"

#include "Dev_Config.h"

#include "timer.h"
#include "time.h"

/**
 * ----------------------------------------------------------------------------------------------------
 * Macros
 * ----------------------------------------------------------------------------------------------------
 */
/* Buffer */
#define ETHERNET_BUF_MAX_SIZE (1024 * 2)

/* Socket */
#define SOCKET_MQTT 0

/* Port */
#define PORT_MQTT 1883

/* Timeout */
#define DEFAULT_TIMEOUT 1000 // 1 second

/* MQTT SUBSCRIBE*/
#define MQTT_CLIENT_ID "MQTT Client ID"
#define MQTT_USERNAME "MQTT Connect Username" 
#define MQTT_PASSWORD "MQTT Connect Password"
#define MQTT_SUBSCRIBE_TOPIC "MQTT Subscribe Topic"
#define MQTT_KEEP_ALIVE 60 // 60 milliseconds

/* MQTT PUBLISH*/
#define MQTT_PUBLISH_TOPIC "MQTT Publish Topic"
#define MQTT_PUBLISH_PAYLOAD "{\"data\":{\"CH?\":?}}"
#define MQTT_PUBLISH_PERIOD (1000 * 10) // 10 seconds

/* Relay */
int RELAY_GPIO[8] = {RELAY_CH1,RELAY_CH2,RELAY_CH3,RELAY_CH4,RELAY_CH5,RELAY_CH6,RELAY_CH7,RELAY_CH8};
int RELAY_NUM = sizeof(RELAY_GPIO) / sizeof(RELAY_GPIO[0]);

static MQTTMessage g_mqtt_message;

/**
 * ----------------------------------------------------------------------------------------------------
 * Variables
 * ----------------------------------------------------------------------------------------------------
 */
/* Network */
static NetInfo g_net_info =
    {
        .mac = {0x00, 0x08, 0xDC, 0x12, 0x34, 0x56}, // MAC address
        .ip = {192, 168, 10, 196},                   // IP address
        .sn = {255, 255, 252, 0},                    // Subnet Mask
        .gw = {192, 168, 11, 1},                     // Gateway
        .dns = {8, 8, 8, 8},                         // DNS server
        .dhcp = NETINFO_STATIC        
};

/* MQTT */
static uint8_t g_mqtt_send_buf[ETHERNET_BUF_MAX_SIZE] = {
    0,
};
static uint8_t g_mqtt_recv_buf[ETHERNET_BUF_MAX_SIZE] = {
    0,
};
static uint8_t g_mqtt_broker_ip[4] = {8, 210, 171, 95}; // MQTT Server IP
static Network g_mqtt_network;
static MQTTClient g_mqtt_client;
static MQTTPacket_connectData g_mqtt_packet_connect_data = MQTTPacket_connectData_initializer;

/* Timer  */
static void repeating_timer_callback(void);

/**
 * ----------------------------------------------------------------------------------------------------
 * Functions
 * ----------------------------------------------------------------------------------------------------
 */
/* MQTT */
static void message_arrived(MessageData *msg_data);

/**
 * ----------------------------------------------------------------------------------------------------
 * Main
 * ----------------------------------------------------------------------------------------------------
 */
int main()
{
    /* Initialize */
    int32_t retval = 0;

    DEV_Module_Init();

    ethchip_spi_initialize();
    ethchip_cris_initialize();

    ethchip_reset();
    ethchip_initialize();
    ethchip_check();

    ethchip_1ms_timer_initialize(repeating_timer_callback);

    network_initialize(g_net_info);

    /* Get network information */
    print_network_information(g_net_info);

    NewNetwork(&g_mqtt_network, SOCKET_MQTT);

    while(ConnectNetwork(&g_mqtt_network, g_mqtt_broker_ip, PORT_MQTT) != 1)
    {
        printf("Network connectting..\n");
        DEV_Delay_ms(10);
    }

    /* Initialize MQTT client */
    MQTTClientInit(&g_mqtt_client, &g_mqtt_network, DEFAULT_TIMEOUT, g_mqtt_send_buf, ETHERNET_BUF_MAX_SIZE, g_mqtt_recv_buf, ETHERNET_BUF_MAX_SIZE);

    /* Connect to the MQTT broker */
    g_mqtt_packet_connect_data.MQTTVersion = 3;
    g_mqtt_packet_connect_data.cleansession = 1;
    g_mqtt_packet_connect_data.willFlag = 0;
    g_mqtt_packet_connect_data.keepAliveInterval = MQTT_KEEP_ALIVE;
    g_mqtt_packet_connect_data.clientID.cstring = MQTT_CLIENT_ID;
    g_mqtt_packet_connect_data.username.cstring = MQTT_USERNAME;
    g_mqtt_packet_connect_data.password.cstring = MQTT_PASSWORD;

    /* Connect */
    while(MQTTConnect(&g_mqtt_client, &g_mqtt_packet_connect_data) < 0)
    {
        printf("MQTT connectting...\n");
        DEV_Delay_ms(10);
    }

    printf("MQTT connected\n");

    /* Subscribe */
    while(MQTTSubscribe(&g_mqtt_client, MQTT_SUBSCRIBE_TOPIC, QOS0, message_arrived) < 0)
    {
        printf("Subscribe topic...\n");
        DEV_Delay_ms(1000);
    }

    printf("Subscrib to %s\n", MQTT_SUBSCRIBE_TOPIC);

    /* Configure publish message */
    g_mqtt_message.qos = QOS0;
    g_mqtt_message.retained = 0;
    g_mqtt_message.dup = 0;
    g_mqtt_message.payload = MQTT_PUBLISH_PAYLOAD;
    g_mqtt_message.payloadlen = strlen(g_mqtt_message.payload);

    /* Infinite loop */
    while(1)
    {
        while((MQTTYield(&g_mqtt_client, g_mqtt_packet_connect_data.keepAliveInterval)) < 0)
        {
            printf("Yield error : %d\n", retval);
            DEV_Delay_ms(1000);
        }
        if(g_mqtt_client.msg.payload != NULL)
        {
            /* Parse MQTT message */
            char ch_name[10];
            int value;
            if (sscanf(g_mqtt_client.msg.payload, "{\"data\":{\"%[^\"]\":%d}}", ch_name, &value) != 2) 
            {
                printf("Data error!\n");
                continue;
            }

            /* Control relay */
            if(ch_name[0]=='C' && ch_name[1]=='H' && (ch_name[2]>='1' && ch_name[2]<='8'))
            {
                gpio_put(ch_name[2]-'1'+17,value);
                printf("\nRelay CH%c %s\n", ch_name[2],value?"ON":"OFF");    
            }
            else if(strcmp(ch_name,"ALL")==0)
            {
                for (int i = 0; i < RELAY_NUM; i++)
                {
                    gpio_put(RELAY_GPIO[i], value);
                }
                printf("\nRelay ALL %s\n",value?"ON":"OFF");    
            }
            g_mqtt_message.payload = g_mqtt_client.msg.payload;

            /* Sending MQTT messages */
            while(MQTTPublish(&g_mqtt_client, MQTT_PUBLISH_TOPIC, &g_mqtt_message) < 0)
            {
                printf("Publish to %s\n", MQTT_PUBLISH_TOPIC);
                DEV_Delay_ms(1000);
            }
            g_mqtt_client.msg.payload = NULL;
        }
        DEV_Delay_ms(100);
    }
}

/**
 * ----------------------------------------------------------------------------------------------------
 * Functions
 * ----------------------------------------------------------------------------------------------------
 */
/* MQTT */
static void message_arrived(MessageData *msg_data)
{
    MQTTMessage *message = msg_data->message;

    printf("%.*s", (uint32_t)message->payloadlen, (uint8_t *)message->payload);
}

/* Timer */
static void repeating_timer_callback(void)
{
    MilliTimer_Handler();
}
