<?php

return [
    /*
    | Public legal pages require a complete structure and recorded business
    | and legal review for the exact version before publication.
    */
    'pages' => [
        'privacidade' => [
            'status' => 'draft',
            'version' => '0.1',
            'published_at' => '',
            'approvals' => [
                'business' => ['reviewer' => null, 'version' => null, 'content_hash' => null, 'approved_at' => null],
                'legal' => ['reviewer' => null, 'version' => null, 'content_hash' => null, 'approved_at' => null],
            ],
            'title' => 'Política de Privacidade',
            'sections' => [
                [
                    'key' => 'controller_contact',
                    'title' => 'Quem somos e a quem esta política se aplica',
                    'content' => 'A Central de Reservas Caldas Novas CRCN Ltda., CNPJ 67.314.679/0001-64, opera este site e seus fluxos de reserva. Esta política explica, em linguagem simples, como tratamos dados pessoais quando você navega, solicita uma reserva ou usa o checkout.\n\nPara dúvidas ou solicitações sobre privacidade, fale com a equipe pelo e-mail centraldereservascn@gmail.com. A definição formal dos papéis de cada empresa envolvida no tratamento deve ser consultada nos documentos e condições da reserva.',
                ],
                [
                    'key' => 'data_categories',
                    'title' => 'Quais dados podemos coletar',
                    'content' => 'Conforme a etapa e o tipo de reserva, podemos tratar nome, e-mail, telefone, CPF ou CNPJ, dados da hospedagem, datas, número de hóspedes, informações necessárias para identificar a reserva e dados relacionados ao pagamento. Se você preencher informações de acompanhantes ou de check-in, esses dados também poderão ser tratados para organizar a hospedagem.\n\nO site pode receber informações técnicas de navegação, como endereço IP, identificadores do navegador e preferências de cookies, de acordo com suas escolhas de consentimento.',
                ],
                [
                    'key' => 'purposes_legal_bases',
                    'title' => 'Para que usamos os dados',
                    'content' => 'Usamos os dados para localizar e administrar a reserva; preparar e processar a cobrança escolhida; enviar atualizações e instruções relacionadas à hospedagem; prestar atendimento; prevenir fraude e proteger o site; cumprir obrigações legais; e manter registros necessários para resolver dúvidas ou disputas.\n\nQuando você autoriza cookies de medição ou publicidade, os dados correspondentes também podem ser usados para entender o uso do site e avaliar campanhas, conforme as opções apresentadas no aviso de cookies.',
                ],
                [
                    'key' => 'sharing_processors',
                    'title' => 'Com quem podemos compartilhar',
                    'content' => 'Compartilhamos somente os dados necessários com prestadores que ajudam a operar a reserva e o pagamento, como a plataforma de gestão de hospedagens Stays e o processador de pagamento exibido no checkout, além de fornecedores técnicos de hospedagem, autenticação e segurança. Esses prestadores tratam dados conforme suas funções e condições próprias.\n\nFerramentas de análise e publicidade só devem ser ativadas conforme as preferências de consentimento disponíveis no site. Não vendemos dados pessoais.',
                ],
                [
                    'key' => 'payment_data',
                    'title' => 'Pagamentos com cartão',
                    'content' => 'Quando o checkout oferece cartão pela Cielo, os dados do cartão são enviados pelo componente seguro da Cielo para gerar um token temporário usado na solicitação de pagamento. O site envia esse token ao servidor para processar a cobrança. Não solicitamos o código de segurança do cartão por e-mail, telefone ou WhatsApp. Outros meios de pagamento podem seguir o fluxo seguro do respectivo processador.',
                ],
                [
                    'key' => 'cookies_tracking',
                    'title' => 'Cookies e preferências',
                    'content' => 'O site pode usar cookies necessários ao funcionamento e, conforme sua escolha, cookies de análise ou publicidade. Você pode rever as preferências pelo controle de cookies disponibilizado no site. Bloquear cookies necessários pode afetar algumas funções, como manter a sessão ou concluir etapas da reserva.',
                ],
                [
                    'key' => 'retention_deletion',
                    'title' => 'Por quanto tempo guardamos os dados',
                    'content' => 'Mantemos os dados pelo período necessário para operar a reserva, prestar atendimento, cumprir obrigações legais e proteger direitos. O prazo depende do tipo de dado e da finalidade. Quando não houver mais necessidade, os dados serão eliminados ou mantidos de forma protegida quando a lei permitir ou exigir sua conservação.',
                ],
                [
                    'key' => 'data_subject_rights',
                    'title' => 'Seus direitos e como pedir ajuda',
                    'content' => 'Você pode solicitar confirmação do tratamento, acesso, correção e, quando aplicável, anonimização, bloqueio ou eliminação de dados, informações sobre compartilhamento e revisão de decisões automatizadas, além de exercer outros direitos previstos na legislação. Alguns pedidos podem ter limites legais ou exigir confirmação da sua identidade.\n\nEnvie sua solicitação para centraldereservascn@gmail.com e informe como podemos localizar a reserva. Não envie dados completos de cartão ou código de segurança.',
                ],
                [
                    'key' => 'security_incidents',
                    'title' => 'Segurança e atualizações',
                    'content' => 'Adotamos medidas técnicas e administrativas para proteger os dados, sem que qualquer transmissão ou armazenamento pela internet possa ser garantido como absolutamente seguro. Podemos atualizar esta política para refletir mudanças no serviço ou na legislação. A versão e a data indicadas nesta página identificam o texto vigente no site.',
                ],
            ],
        ],
        'termos' => [
            'status' => 'draft',
            'version' => '0.1',
            'published_at' => '',
            'approvals' => [
                'business' => ['reviewer' => null, 'version' => null, 'content_hash' => null, 'approved_at' => null],
                'legal' => ['reviewer' => null, 'version' => null, 'content_hash' => null, 'approved_at' => null],
            ],
            'title' => 'Termos de Uso',
            'sections' => [
                [
                    'key' => 'supplier_identity_contact',
                    'title' => 'Uso do site',
                    'content' => 'Estes termos explicam as condições gerais de uso do site da Central de Reservas Caldas Novas CRCN Ltda., CNPJ 67.314.679/0001-64. Ao navegar ou iniciar uma reserva, você concorda em usar o site de forma lícita, fornecer informações corretas e proteger seus dados de acesso.\n\nPara suporte, entre em contato pelo e-mail centraldereservascn@gmail.com.',
                ],
                [
                    'key' => 'price_payment_conditions',
                    'title' => 'Informações da hospedagem e preço',
                    'content' => 'A acomodação, as datas, a quantidade de hóspedes permitida, os serviços incluídos, o preço, as formas de pagamento e as condições aplicáveis são apresentados durante a busca e no resumo antes da confirmação. Confira essas informações e as regras específicas da acomodação e da tarifa antes de concluir.\n\nA disponibilidade e o preço podem mudar até que a solicitação seja concluída, conforme indicado no fluxo de reserva.',
                ],
                [
                    'key' => 'booking_confirmation',
                    'title' => 'Solicitação e confirmação da reserva',
                    'content' => 'Enviar uma solicitação ou iniciar o checkout não significa, por si só, que a reserva está confirmada. A confirmação depende da conclusão das etapas informadas no checkout, da aprovação ou identificação do pagamento quando aplicável e da validação da reserva. A confirmação será comunicada pelos canais fornecidos.\n\nGuarde o código e as mensagens da reserva para consultar o atendimento.',
                ],
                [
                    'key' => 'payment_terms',
                    'title' => 'Pagamento',
                    'content' => 'Os meios de pagamento, valores, eventuais taxas, parcelamento e prazos disponíveis são exibidos no checkout para cada reserva. A cobrança é encaminhada ao processador apresentado no fluxo. Um pagamento em análise ou ainda não confirmado não deve ser considerado como confirmação da hospedagem. Não compartilhe senha, código de segurança do cartão ou código de autenticação com terceiros.',
                ],
                [
                    'key' => 'changes_cancellations_refunds',
                    'title' => 'Alterações, cancelamentos e reembolsos',
                    'content' => 'As condições de alteração, cancelamento, não comparecimento e reembolso dependem da acomodação, da tarifa escolhida, das informações mostradas antes da contratação e da legislação aplicável. Consulte essas condições no resumo da reserva e na confirmação recebida.\n\nPara solicitar ajuda ou registrar um pedido, use os canais de atendimento informados no site. Os pedidos serão analisados conforme as condições contratadas e os direitos previstos em lei.',
                ],
                [
                    'key' => 'guest_responsibilities',
                    'title' => 'Informações e responsabilidades do hóspede',
                    'content' => 'Você é responsável por manter corretas as informações fornecidas, conferir os dados da reserva e comunicar qualquer divergência assim que identificá-la. O uso do site não autoriza fraude, tentativa de acesso indevido, interferência no funcionamento do serviço ou envio de conteúdo ilícito.',
                ],
                [
                    'key' => 'service_roles_privacy',
                    'title' => 'Atendimento e proteção de dados',
                    'content' => 'A equipe presta suporte pelos canais exibidos no site. O uso e o compartilhamento de dados pessoais necessários à reserva e ao pagamento estão descritos na Política de Privacidade, que complementa estes termos.',
                ],
                [
                    'key' => 'consumer_rights_updates',
                    'title' => 'Direitos legais e atualização destes termos',
                    'content' => 'Estes termos não afastam os direitos que a legislação garante ao consumidor. Podemos atualizar o texto para refletir mudanças no site, no serviço ou na legislação; a versão e a data publicadas nesta página identificam o texto vigente. As condições específicas apresentadas para uma reserva e registradas na sua confirmação continuam relevantes para aquela contratação.',
                ],
            ],
        ],
        'cancelamento' => [
            'status' => 'draft',
            'version' => '0.1',
            'published_at' => '',
            'approvals' => [
                'business' => ['reviewer' => null, 'version' => null, 'content_hash' => null, 'approved_at' => null],
                'legal' => ['reviewer' => null, 'version' => null, 'content_hash' => null, 'approved_at' => null],
            ],
            'title' => '',
            'sections' => [],
        ],
    ],
];
